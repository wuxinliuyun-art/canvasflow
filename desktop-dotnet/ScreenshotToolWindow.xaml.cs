using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media.Imaging;
using WpfComboBox = System.Windows.Controls.ComboBox;

namespace CanvasFlow.Desktop;

public partial class ScreenshotToolWindow : Window
{
    private const int DwmUseImmersiveDarkMode = 20;
    private const int DwmCaptionColor = 35;
    private const int DwmTextColor = 36;
    private sealed record PromptTemplate(string Id, string Name, string Content);

    private readonly string _root;
    private readonly string _settingsPath;
    private readonly string _latestCapturePath;
    private readonly ScreenshotToolSettings _settings;
    private readonly List<PromptTemplate> _prompts = [];
    private readonly List<string> _resultPaths = [];
    private bool _loading = true;
    private bool _allowClose;
    private bool _darkTheme;
    private int _resultIndex = -1;
    private readonly List<ScreenshotCanvasNodeOption> _canvasNodes = [];

    public event Func<ScreenshotGenerationRequest, Task>? GenerationRequested;
    public event Func<Task>? PromptLibraryChanged;

    public ScreenshotToolWindow(string root)
    {
        InitializeComponent();
        _root = root;
        _settingsPath = Path.Combine(root, "data", "screenshot-settings.json");
        _latestCapturePath = Path.Combine(root, "data", "screenshots", "latest.png");
        _settings = ScreenshotSettingsStore.Load(_settingsPath);
        LoadPromptTemplates();
        ApplySettings();
        Loaded += (_, _) =>
        {
            _loading = false;
            UpdateRegionStatus();
            if (File.Exists(_latestCapturePath)) TrySetPreview(CapturePreview, _latestCapturePath, "最近截图");
        };
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        ApplyTitleBarTheme(_darkTheme);
    }

    public void ShowAndActivate()
    {
        LoadPromptTemplates();
        PromptCombo.SelectedValue = _settings.PromptTemplateId;
        if (PromptCombo.SelectedIndex < 0 && _prompts.Count > 0) PromptCombo.SelectedIndex = 0;
        EnsureVisibleWindowPosition();
        if (!IsVisible) Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
    }

    public void ShutdownWindow()
    {
        _allowClose = true;
        SaveSettings();
        Close();
    }

    public void SuspendForCanvasDialog()
    {
        Topmost = false;
    }

    public void RestoreAfterCanvasDialog()
    {
        Topmost = _settings.IsTopmost;
        if (IsVisible) Activate();
    }

    public void ApplyTheme(bool dark)
    {
        _darkTheme = dark;
        SetBrush("WindowBackgroundBrush", dark ? "#1B1C1E" : "#F4F5F6");
        SetBrush("CardBackgroundBrush", dark ? "#202123" : "#FFFFFF");
        SetBrush("ControlBackgroundBrush", dark ? "#17181A" : "#FFFFFF");
        SetBrush("BorderBrush", dark ? "#34363A" : "#E0E2E5");
        SetBrush("PrimaryTextBrush", dark ? "#F0F1F3" : "#202226");
        SetBrush("MutedTextBrush", dark ? "#94979E" : "#7D828A");
        SetBrush("PreviewBackgroundBrush", dark ? "#151618" : "#F4F5F6");
        SetBrush("StatusBackgroundBrush", dark ? "#202123" : "#FFFFFF");
        SetBrush("HoverBackgroundBrush", dark ? "#303134" : "#EDEEF0");
        SetBrush("HoverTextBrush", dark ? "#F0F1F3" : "#202226");
        SetBrush("PrimaryButtonBrush", dark ? "#E1E2E5" : "#27292D");
        SetBrush("PrimaryButtonTextBrush", dark ? "#17181A" : "#FFFFFF");
        ApplyTitleBarTheme(dark);
    }

    private void ApplyTitleBarTheme(bool dark)
    {
        var handle = new WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return;
        var darkMode = dark ? 1 : 0;
        var captionColor = dark ? 0x001E1C1B : 0x00F6F5F4; // COLORREF: #1B1C1E / #F4F5F6
        var textColor = dark ? 0x00F3F1F0 : 0x00262220;    // COLORREF: #F0F1F3 / #202226
        DwmSetWindowAttribute(handle, DwmUseImmersiveDarkMode, ref darkMode, sizeof(int));
        DwmSetWindowAttribute(handle, DwmCaptionColor, ref captionColor, sizeof(int));
        DwmSetWindowAttribute(handle, DwmTextColor, ref textColor, sizeof(int));
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr windowHandle, int attribute, ref int value, int valueSize);

    public void HandleTaskUpdate(ScreenshotTaskUpdate update)
    {
        Dispatcher.Invoke(() =>
        {
            if (update.Status == "done" && !string.IsNullOrWhiteSpace(update.OutputPath) && File.Exists(update.OutputPath))
            {
                _resultPaths.Add(update.OutputPath);
                _resultIndex = _resultPaths.Count - 1;
                ShowCurrentResult();
                SetPreviewMode("result");
                SetStatus($"生成完成，已保存到：{update.OutputPath}");
            }
            else if (update.Status == "failed")
            {
                SetPreviewMode("capture");
                SetStatus($"生成失败。可能原因：网络、API Key 或模型服务异常。建议：检查主画板任务队列后重试。详细信息：{update.Error}", true);
            }
            else if (update.Status == "cancelled")
            {
                SetPreviewMode("capture");
                SetStatus("已取消发送，截图和画布节点设置均保持不变。");
            }
            else
            {
                SetStatus($"任务处理中：{Math.Clamp(update.Progress, 0, 100)}%");
            }
        });
    }

    public void UpdateCanvasNodes(IEnumerable<ScreenshotCanvasNodeOption> nodes)
    {
        Dispatcher.Invoke(() =>
        {
            var selected = _settings.CanvasNodeId;
            _canvasNodes.Clear();
            _canvasNodes.AddRange(nodes.Where(item => !string.IsNullOrWhiteSpace(item.Id)));
            CanvasNodeCombo.ItemsSource = null;
            CanvasNodeCombo.ItemsSource = _canvasNodes;
            CanvasNodeCombo.SelectedValue = selected;
            if (CanvasNodeCombo.SelectedIndex < 0 && _canvasNodes.Count > 0) CanvasNodeCombo.SelectedIndex = 0;
            UpdateCanvasNodeSummary();
        });
    }

    private void ApplySettings()
    {
        TopmostToggle.IsChecked = _settings.IsTopmost;
        Topmost = _settings.IsTopmost;
        AutoCaptureToggle.IsChecked = _settings.AutoCaptureBeforeSend;
        UseCanvasNodeToggle.IsChecked = _settings.UseCanvasNodeInput;
        SelectByTag(ModelCombo, _settings.Model);
        UpdateModelFields();
        SelectByTag(ResolutionCombo, _settings.Resolution);
        SelectByTag(QualityCombo, _settings.Quality);
        SelectByTag(RatioCombo, _settings.Ratio);
        SelectByTag(CountCombo, _settings.Count.ToString());
        PromptCombo.ItemsSource = _prompts;
        PromptCombo.SelectedValue = _settings.PromptTemplateId;
        if (PromptCombo.SelectedIndex < 0 && _prompts.Count > 0) PromptCombo.SelectedIndex = 0;
        if (string.IsNullOrWhiteSpace(_settings.PromptText) && PromptCombo.SelectedItem is PromptTemplate initialPrompt)
            _settings.PromptText = initialPrompt.Content;
        PromptTextBox.Text = _settings.PromptText;
        if (!double.IsNaN(_settings.WindowLeft) && !double.IsNaN(_settings.WindowTop))
        {
            Left = _settings.WindowLeft;
            Top = _settings.WindowTop;
        }
        SetCollapsed(_settings.IsCollapsed);
        _settings.PreviewVisible = true;
        PreviewPanel.Visibility = Visibility.Visible;
        SetPreviewMode(_settings.PreviewMode);
        SetParametersVisible(_settings.ParametersVisible);
        UpdateCanvasInputMode();
    }

    private void LoadPromptTemplates()
    {
        var selectedId = _settings.PromptTemplateId;
        var previousLoading = _loading;
        _loading = true;
        _prompts.Clear();
        var path = Path.Combine(_root, "data", "custom-library.json");
        try
        {
            if (File.Exists(path))
            {
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                if (document.RootElement.TryGetProperty("textTemplates", out var templates))
                    foreach (var item in templates.EnumerateArray())
                    {
                        var id = item.TryGetProperty("id", out var idValue) ? idValue.GetString() ?? "" : "";
                        var name = item.TryGetProperty("name", out var nameValue) ? nameValue.GetString() ?? "未命名" : "未命名";
                        var content = item.TryGetProperty("content", out var contentValue) ? contentValue.GetString() ?? "" : "";
                        if (!string.IsNullOrWhiteSpace(content)) _prompts.Add(new PromptTemplate(id, name, content));
                    }
            }
        }
        catch (Exception error)
        {
            SetStatus($"自定义文字读取失败。可能原因：素材库文件损坏。建议：在主画板设置中检查素材库。详细信息：{error.Message}", true);
        }
        if (PromptCombo is not null)
        {
            PromptCombo.ItemsSource = null;
            PromptCombo.ItemsSource = _prompts;
            PromptCombo.SelectedValue = selectedId;
            if (PromptCombo.SelectedIndex < 0 && _prompts.Count > 0) PromptCombo.SelectedIndex = 0;
        }
        _loading = previousLoading;
    }

    private void RefreshPromptsButton_Click(object sender, RoutedEventArgs e)
    {
        LoadPromptTemplates();
        SetStatus($"已刷新自定义文字：{_prompts.Count} 条");
    }

    private void PromptCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading || PromptCombo.SelectedItem is not PromptTemplate prompt) return;
        _settings.PromptTemplateId = prompt.Id;
        _settings.PromptText = prompt.Content;
        PromptTextBox.Text = prompt.Content;
        SaveSettings();
    }

    private void PromptTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loading) return;
        _settings.PromptText = PromptTextBox.Text;
        SaveSettings();
    }

    private async void SavePromptButton_Click(object sender, RoutedEventArgs e)
    {
        if (PromptCombo.SelectedItem is not PromptTemplate prompt)
        {
            SetStatus("没有可保存的自定义文字。可能原因：尚未选择模板。建议：先选择一条自定义文字。", true);
            return;
        }
        var content = PromptTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(content))
        {
            SetStatus("提示词为空，无法保存。建议：输入内容后重试。", true);
            return;
        }
        var path = Path.Combine(_root, "data", "custom-library.json");
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var library = System.Text.Json.Nodes.JsonNode.Parse(document.RootElement.GetRawText())?.AsObject()
                ?? throw new InvalidDataException("素材库内容为空");
            var templates = library["textTemplates"]?.AsArray() ?? throw new InvalidDataException("素材库缺少自定义文字列表");
            var target = templates.OfType<System.Text.Json.Nodes.JsonObject>().FirstOrDefault(item => item["id"]?.GetValue<string>() == prompt.Id)
                ?? throw new InvalidDataException("所选自定义文字已经不存在");
            target["content"] = content;
            target["revision"] = (target["revision"]?.GetValue<int>() ?? 0) + 1;
            var temporary = path + $".{Environment.ProcessId}.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.tmp";
            await File.WriteAllTextAsync(temporary, library.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            File.Move(temporary, path, true);
            _settings.PromptText = content;
            SaveSettings();
            LoadPromptTemplates();
            PromptCombo.SelectedValue = prompt.Id;
            if (PromptLibraryChanged is not null) await PromptLibraryChanged.Invoke();
            SetStatus($"已保存并同步到自定义文字：{prompt.Name}");
        }
        catch (Exception error)
        {
            SetStatus($"提示词保存失败。可能原因：素材库文件损坏或 data 目录不可写。建议：在主画板素材库中检查后重试。详细信息：{error.Message}", true);
        }
    }

    private async Task<bool> SelectRegionAsync()
    {
        var wasVisible = IsVisible;
        try
        {
            Hide();
            await Task.Delay(180);
            var screen = ScreenCaptureService.CurrentScreen();
            using var frozen = ScreenCaptureService.CaptureScreen(screen);
            var selector = new RegionSelectionWindow(screen, frozen);
            var selected = selector.ShowDialog() == true ? selector.SelectedRegion : null;
            if (selected is null)
            {
                SetStatus("已取消框选，原截图区域保持不变。");
                return false;
            }
            _settings.Region = selected;
            SaveSettings();
            UpdateRegionStatus();
            await CaptureLatestAsync();
            return true;
        }
        catch (Exception error)
        {
            SetStatus($"无法设置截图区域。可能原因：屏幕捕获权限或显示器状态异常。建议：关闭远程桌面/投屏后重试。详细信息：{error.Message}", true);
            return false;
        }
        finally
        {
            if (wasVisible) ShowAndActivate();
        }
    }

    private async void CaptureButton_Click(object sender, RoutedEventArgs e)
    {
        await SelectRegionAsync();
    }

    private async Task<bool> CaptureLatestAsync()
    {
        if (_settings.Region is null)
        {
            SetStatus("尚未设置截图区域。可能原因：首次使用或显示器环境已变化。建议：点击“截图”重新框选。", true);
            return false;
        }
        try
        {
            Hide();
            await Task.Delay(160);
            using var bitmap = await Task.Run(() => ScreenCaptureService.CaptureRegion(_settings.Region));
            await Task.Run(() => ScreenCaptureService.SavePng(bitmap, _latestCapturePath));
            if (!TrySetPreview(CapturePreview, _latestCapturePath, "最近截图")) return false;
            SetPreviewMode("capture");
            SetStatus($"截图完成：{bitmap.Width} × {bitmap.Height}");
            return true;
        }
        catch (Exception error)
        {
            SetStatus($"截图失败。可能原因：显示器、分辨率或缩放设置发生变化。建议：点击“截图”重新框选。详细信息：{error.Message}", true);
            return false;
        }
        finally
        {
            ShowAndActivate();
        }
    }

    private async void SendButton_Click(object sender, RoutedEventArgs e)
    {
        if (_settings.AutoCaptureBeforeSend && !await CaptureLatestAsync()) return;
        if (!File.Exists(_latestCapturePath))
        {
            SetStatus("没有可发送的截图。可能原因：尚未截图。建议：先点击“截图”或开启发送前自动截图。", true);
            return;
        }
        if (!_settings.UseCanvasNodeInput && PromptCombo.SelectedItem is not PromptTemplate)
        {
            SetStatus("没有默认提示词。可能原因：自定义文字为空。建议：先在主画板设置的素材库中新建自定义文字。", true);
            return;
        }
        var promptText = PromptTextBox.Text.Trim();
        if (!_settings.UseCanvasNodeInput && string.IsNullOrWhiteSpace(promptText))
        {
            SetStatus("提示词为空。可能原因：模板内容被清空。建议：重新选择自定义文字或输入本次提示词。", true);
            return;
        }
        if (GenerationRequested is null)
        {
            SetStatus("无法发送任务。可能原因：主画板尚未完成加载。建议：等待画板加载后重试。", true);
            return;
        }
        if (_settings.UseCanvasNodeInput && string.IsNullOrWhiteSpace(_settings.CanvasNodeId))
        {
            SetStatus("没有选择截图功能节点。可能原因：当前项目尚未创建节点。建议：在画布右键添加截图功能节点并连接文字后重试。", true);
            return;
        }

        ReadControlsIntoSettings();
        SaveSettings();
        var dataUrl = ScreenCaptureService.ToDataUrl(_latestCapturePath);
        var request = new ScreenshotGenerationRequest(
            $"capture-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", dataUrl, promptText,
            _settings.Model, _settings.Resolution, _settings.Quality, _settings.Ratio,
            _settings.Count, dataUrl, _settings.UseCanvasNodeInput, _settings.CanvasNodeId);
        try
        {
            SetPreviewMode("result");
            await GenerationRequested.Invoke(request);
            SetStatus(_settings.UseCanvasNodeInput
                ? "任务已发送到主画板；如包含批量图片，请在主画板确认任务数量。"
                : $"已加入任务队列：{_settings.Count} 个任务。可在主画板右侧任务队列中查看。");
        }
        catch (Exception error)
        {
            SetStatus($"任务未发送。可能原因：主画板未就绪或桌面通信中断。建议：重新打开主画板后重试。详细信息：{error.Message}", true);
        }
    }

    private void CollapseButton_Click(object sender, RoutedEventArgs e) => SetCollapsed(!_settings.IsCollapsed);
    private void ParametersToggleButton_Click(object sender, RoutedEventArgs e)
    {
        var show = !_settings.ParametersVisible;
        if (show && _settings.IsCollapsed) SetCollapsed(false);
        SetParametersVisible(show);
    }

    private void UseCanvasNodeToggle_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.UseCanvasNodeInput = UseCanvasNodeToggle.IsChecked == true;
        UpdateCanvasInputMode();
        SaveSettings();
    }

    private void CanvasNodeCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        _settings.CanvasNodeId = (CanvasNodeCombo.SelectedItem as ScreenshotCanvasNodeOption)?.Id ?? "";
        UpdateCanvasNodeSummary();
        SaveSettings();
    }

    private void UpdateCanvasInputMode()
    {
        var enabled = _settings.UseCanvasNodeInput;
        CanvasNodePanel.Visibility = enabled && !_settings.IsCollapsed ? Visibility.Visible : Visibility.Collapsed;
        ParametersToggleButton.Visibility = enabled ? Visibility.Collapsed : Visibility.Visible;
        ParametersButtonColumn.Width = enabled ? new GridLength(0) : new GridLength(1, GridUnitType.Star);
        AdvancedPanel.Visibility = !enabled && _settings.ParametersVisible && !_settings.IsCollapsed ? Visibility.Visible : Visibility.Collapsed;
        UpdateCanvasNodeSummary();
    }

    private void UpdateCanvasNodeSummary()
    {
        var selected = CanvasNodeCombo.SelectedItem as ScreenshotCanvasNodeOption;
        CanvasNodeSummary.Text = selected?.Summary ?? (_canvasNodes.Count == 0 ? "当前项目没有截图功能节点" : "请选择截图功能节点");
    }

    private void PreviewSwitchButton_Click(object sender, RoutedEventArgs e) => SetPreviewMode(_settings.PreviewMode == "result" ? "capture" : "result");

    private void SetPreviewMode(string mode)
    {
        _settings.PreviewMode = mode == "result" ? "result" : "capture";
        CapturePreviewCard.Visibility = _settings.PreviewMode == "capture" ? Visibility.Visible : Visibility.Collapsed;
        ResultPreviewCard.Visibility = _settings.PreviewMode == "result" ? Visibility.Visible : Visibility.Collapsed;
        PreviewSwitchButton.Content = _settings.PreviewMode == "capture" ? "›" : "‹";
        PreviewSwitchButton.ToolTip = _settings.PreviewMode == "capture" ? "显示生成结果" : "显示最近截图";
        if (!_loading) SaveSettings();
    }

    private void SetCollapsed(bool value)
    {
        _settings.IsCollapsed = value;
        CanvasNodePanel.Visibility = !value && _settings.UseCanvasNodeInput ? Visibility.Visible : Visibility.Collapsed;
        AdvancedPanel.Visibility = !value && !_settings.UseCanvasNodeInput && _settings.ParametersVisible ? Visibility.Visible : Visibility.Collapsed;
        CollapseButton.Content = value ? "+" : "−";
        MinHeight = value ? 390 : 500;
        Height = value ? 390 : (_settings.ParametersVisible ? Math.Max(Height, 720) : 500);
        if (!_loading) SaveSettings();
    }

    private void SetParametersVisible(bool value)
    {
        _settings.ParametersVisible = value;
        AdvancedPanel.Visibility = value && !_settings.IsCollapsed && !_settings.UseCanvasNodeInput ? Visibility.Visible : Visibility.Collapsed;
        ParametersToggleButton.Content = value ? "隐藏参数" : "显示参数";
        if (!_settings.IsCollapsed) Height = value ? Math.Max(Height, 720) : 500;
        UpdateLayout();
        if (!_loading) SaveSettings();
    }

    private void TopmostToggle_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        _settings.IsTopmost = TopmostToggle.IsChecked == true;
        Topmost = _settings.IsTopmost;
        SaveSettings();
    }

    private void SettingsControl_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        if (ReferenceEquals(sender, ModelCombo)) UpdateModelFields();
        ReadControlsIntoSettings();
        SaveSettings();
    }

    private void ReadControlsIntoSettings()
    {
        _settings.PromptTemplateId = (PromptCombo.SelectedItem as PromptTemplate)?.Id ?? "";
        _settings.PromptText = PromptTextBox.Text;
        _settings.Model = SelectedTag(ModelCombo, "gpt-image-2");
        _settings.Resolution = SelectedTag(ResolutionCombo, "1k");
        _settings.Quality = SelectedTag(QualityCombo, "low");
        _settings.Ratio = SelectedTag(RatioCombo, "1:1");
        _settings.Count = int.TryParse(SelectedTag(CountCombo, "1"), out var count) ? Math.Clamp(count, 1, 4) : 1;
        _settings.AutoCaptureBeforeSend = AutoCaptureToggle.IsChecked == true;
    }

    private void UpdateRegionStatus()
    {
        var region = _settings.Region;
        var valid = region is not null && ScreenCaptureService.ResolveScreen(region) is not null;
        RegionStatus.Text = valid
            ? $"已设置区域 · {region!.MonitorWidth}×{region.MonitorHeight} 显示器"
            : "截图区域未设置或已失效，请点击“截图”框选";
    }

    private void EnsureVisibleWindowPosition()
    {
        if (double.IsNaN(Left) || double.IsNaN(Top)) return;
        var intersects = System.Windows.Forms.Screen.AllScreens.Any(screen =>
        {
            var area = screen.WorkingArea;
            return Left < area.Right - 48 && Top < area.Bottom - 48 && Left + Math.Max(Width, 120) > area.Left + 48 && Top + 80 > area.Top;
        });
        if (intersects) return;
        var primary = System.Windows.Forms.Screen.PrimaryScreen?.WorkingArea ?? new System.Drawing.Rectangle(0, 0, 1280, 720);
        Left = primary.Right - Width - 24;
        Top = primary.Top + 60;
    }

    private void PreviousResultButton_Click(object sender, RoutedEventArgs e)
    {
        if (_resultPaths.Count == 0) return;
        _resultIndex = (_resultIndex - 1 + _resultPaths.Count) % _resultPaths.Count;
        ShowCurrentResult();
    }

    private void CapturePreview_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2 && File.Exists(_latestCapturePath)) OpenLargePreview(_latestCapturePath);
    }

    private void ResultPreview_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2 && _resultIndex >= 0 && _resultIndex < _resultPaths.Count && File.Exists(_resultPaths[_resultIndex]))
            OpenLargePreview(_resultPaths[_resultIndex]);
    }

    private void CopyResultImageMenuItem_Click(object sender, RoutedEventArgs e)
    {
        if (_resultIndex < 0 || _resultIndex >= _resultPaths.Count)
        {
            SetStatus("当前没有可复制的生成结果。请先发送生成任务并等待图片完成。", true);
            return;
        }
        var path = _resultPaths[_resultIndex];
        try
        {
            if (!File.Exists(path)) throw new FileNotFoundException("生成图片文件不存在", path);
            System.Windows.Clipboard.SetImage(LoadBitmap(path));
            SetStatus("已复制当前生成图片，可直接粘贴到其他软件中。");
        }
        catch (Exception error)
        {
            SetStatus($"复制图片失败。可能原因：图片已移动，或剪贴板正被其他程序占用。建议：确认图片仍存在后重试。详细信息：{error.Message}", true);
        }
    }

    private void OpenLargePreview(string path)
    {
        try
        {
            var preview = new ImagePreviewWindow(path, _darkTheme) { Owner = this };
            preview.Show();
        }
        catch (Exception error)
        {
            SetStatus($"无法打开大图预览。可能原因：图片文件损坏或已被移动。建议：重新截图或生成后重试。详细信息：{error.Message}", true);
        }
    }

    private void NextResultButton_Click(object sender, RoutedEventArgs e)
    {
        if (_resultPaths.Count == 0) return;
        _resultIndex = (_resultIndex + 1) % _resultPaths.Count;
        ShowCurrentResult();
    }

    private void ShowCurrentResult()
    {
        if (_resultIndex < 0 || _resultIndex >= _resultPaths.Count) return;
        if (TrySetPreview(ResultPreview, _resultPaths[_resultIndex], "生成结果"))
            ResultIndexText.Text = $"{_resultIndex + 1} / {_resultPaths.Count}";
    }

    private void Window_StateChanged(object? sender, EventArgs e)
    {
        if (_loading || !IsVisible || WindowState != WindowState.Normal || Left <= -10000 || Top <= -10000) return;
        if (!IsWindowPositionVisible()) return;
        _settings.WindowLeft = Left;
        _settings.WindowTop = Top;
        SaveSettings();
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (_allowClose) return;
        e.Cancel = true;
        SaveSettings();
        Hide();
    }

    private void SaveSettings()
    {
        if (_loading) return;
        try { ScreenshotSettingsStore.Save(_settingsPath, _settings); }
        catch (Exception error) { SetStatus($"截图设置保存失败。可能原因：data 目录没有写入权限。建议：检查安装目录权限。详细信息：{error.Message}", true); }
    }

    private void SetStatus(string message, bool error = false)
    {
        if (StatusText is null) return;
        StatusText.Text = message;
        StatusText.Foreground = error
            ? new System.Windows.Media.SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#E14D4D"))
            : (System.Windows.Media.Brush)FindResource("PrimaryTextBrush");
    }

    private void SetBrush(string key, string color) => Resources[key] = new System.Windows.Media.SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(color));

    private static BitmapImage LoadBitmap(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var image = new BitmapImage();
        image.BeginInit();
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.StreamSource = stream;
        image.EndInit();
        image.Freeze();
        return image;
    }

    private bool TrySetPreview(System.Windows.Controls.Image target, string path, string label)
    {
        try
        {
            target.Source = LoadBitmap(path);
            target.InvalidateVisual();
            return true;
        }
        catch (Exception error)
        {
            target.Source = null;
            SetStatus($"{label}无法显示。可能原因：图片文件损坏或仍在写入。建议：重新截图或稍后重试。详细信息：{error.Message}", true);
            return false;
        }
    }

    private bool IsWindowPositionVisible() => System.Windows.Forms.Screen.AllScreens.Any(screen =>
    {
        var area = screen.WorkingArea;
        return Left < area.Right - 48 && Top < area.Bottom - 48
            && Left + Math.Max(Width, 120) > area.Left + 48 && Top + 80 > area.Top;
    });

    private static void SelectByTag(WpfComboBox comboBox, string tag)
    {
        foreach (var item in comboBox.Items.OfType<ComboBoxItem>())
            if (string.Equals(item.Tag?.ToString(), tag, StringComparison.OrdinalIgnoreCase)) { comboBox.SelectedItem = item; return; }
        comboBox.SelectedIndex = 0;
    }

    private static string SelectedTag(WpfComboBox comboBox, string fallback) => (comboBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? fallback;

    private void UpdateModelFields() => QualityField.Visibility = SelectedTag(ModelCombo, "gpt-image-2") == "gpt-image-2" ? Visibility.Visible : Visibility.Hidden;
}
