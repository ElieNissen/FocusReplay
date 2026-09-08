$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ForegroundApp {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static string Title() { var text = new StringBuilder(512); GetWindowText(GetForegroundWindow(), text, text.Capacity); return text.ToString(); }
  public static int Id() { uint value; GetWindowThreadProcessId(GetForegroundWindow(), out value); return (int)value; }
}
'@
while ($true) {
  try {
    $foregroundId = [ForegroundApp]::Id()
    $foregroundName = (Get-Process -Id $foregroundId -ErrorAction Stop).ProcessName
    $hint = 'unknown'
    if ($env:FOCUS_BROWSER_HINTS -eq '1' -and $foregroundName -match '^(chrome|msedge|firefox|brave|opera)$') {
      $windowText = [ForegroundApp]::Title()
      if ($windowText -match '(?i)(Netflix|Twitch|TikTok|Instagram|Facebook|Reddit)') { $hint = 'distraction' }
      elseif ($windowText -match '(?i)(GitHub|Google Docs|Google Sheets|Google Slides|Notion|Figma|Stack Overflow|Microsoft Learn)') { $hint = 'work' }
      # YouTube, search and unrecognized titles stay ambiguous. Never output or persist titles.
      $windowText = $null
    }
    @{ name = $foregroundName; hint = $hint } | ConvertTo-Json -Compress
  } catch { '{"name":null}' }
  Start-Sleep -Seconds 2
}
