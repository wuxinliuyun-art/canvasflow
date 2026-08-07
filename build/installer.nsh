; CanvasFlow stores user-owned files beside the executable. The default
; electron-builder uninstaller removes $INSTDIR recursively, so temporarily
; move these folders out and restore them after application files are removed.
!macro customRemoveFiles
  SetOutPath "$TEMP"
  CreateDirectory "$PLUGINSDIR\canvasflow-user-data"

  IfFileExists "$INSTDIR\data" 0 +4
    ClearErrors
    Rename "$INSTDIR\data" "$PLUGINSDIR\canvasflow-user-data\data"
    IfErrors 0 +2
      Abort "CanvasFlow data is in use. Close the application and retry."

  IfFileExists "$INSTDIR\download" 0 +4
    ClearErrors
    Rename "$INSTDIR\download" "$PLUGINSDIR\canvasflow-user-data\download"
    IfErrors 0 +2
      Abort "CanvasFlow download files are in use. Close other programs and retry."

  IfFileExists "$INSTDIR\export" 0 +4
    ClearErrors
    Rename "$INSTDIR\export" "$PLUGINSDIR\canvasflow-user-data\export"
    IfErrors 0 +2
      Abort "CanvasFlow export files are in use. Close other programs and retry."

  RMDir /r "$INSTDIR"
  CreateDirectory "$INSTDIR"

  IfFileExists "$PLUGINSDIR\canvasflow-user-data\data" 0 +2
    Rename "$PLUGINSDIR\canvasflow-user-data\data" "$INSTDIR\data"
  IfFileExists "$PLUGINSDIR\canvasflow-user-data\download" 0 +2
    Rename "$PLUGINSDIR\canvasflow-user-data\download" "$INSTDIR\download"
  IfFileExists "$PLUGINSDIR\canvasflow-user-data\export" 0 +2
    Rename "$PLUGINSDIR\canvasflow-user-data\export" "$INSTDIR\export"
!macroend
