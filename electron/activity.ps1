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
if ($true) {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
}
function Get-BrowserDomain {
  try {
    $handle = [ForegroundApp]::GetForegroundWindow()
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
    $edits = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    foreach ($edit in $edits) {
      $info = $edit.Current
      if ($info.AutomationId -notmatch '^(urlbar-input|addressEditBox)$' -and $info.Name -notmatch '^(Address and search bar|Address and Search Bar|Barre d.adresse et de recherche|Barre d.adresse|Search or enter address|Rechercher ou saisir une adresse)$') { continue }
      $parent = $edit
      $toolbar = $false
      for ($depth = 0; $depth -lt 12; $depth++) {
        $parent = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($parent)
        if (!$parent -or $parent.Current.ControlType -eq [System.Windows.Automation.ControlType]::Document) { break }
        if ($parent.Current.ControlType -eq [System.Windows.Automation.ControlType]::ToolBar) { $toolbar = $true; break }
      }
      if (!$toolbar -or $info.IsPassword) { continue }
      $pattern = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      $value = $pattern.Current.Value
      if ($value -notmatch '^https?://') { $value = 'https://' + $value }
      $uri = $null
      if ([Uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri) -and $uri.Scheme -match '^https?$' -and !$uri.UserInfo -and [ForegroundApp]::GetForegroundWindow() -eq $handle) {
        return $uri.DnsSafeHost.ToLowerInvariant()
      }
    }
  } catch {}
  return ''
}
while ($true) {
  try {
    $foregroundId = [ForegroundApp]::Id()
    $foregroundProcess = Get-Process -Id $foregroundId -ErrorAction Stop
    $foregroundName = $foregroundProcess.ProcessName
    $executable = $foregroundProcess.Path
    $sensitive = $false
    try { $sensitive = [System.Windows.Automation.AutomationElement]::FocusedElement.Current.IsPassword } catch {}
    $hint = 'unknown'
    $domain = ''
    if ($env:FOCUS_BROWSER_DOMAINS -eq '1' -and $foregroundName -match '^(chrome|msedge|firefox|brave|opera)$') { $domain = Get-BrowserDomain }
    if ($env:FOCUS_BROWSER_HINTS -eq '1' -and $foregroundName -match '^(chrome|msedge|firefox|brave|opera)$') {
      $windowText = [ForegroundApp]::Title()
      if ($windowText -match '(?i)(Netflix|Twitch|TikTok|Instagram|Facebook|Reddit)') { $hint = 'distraction' }
      elseif ($windowText -match '(?i)(GitHub|Google Docs|Google Sheets|Google Slides|Notion|Figma|Stack Overflow|Microsoft Learn)') { $hint = 'work' }
      # YouTube, search and unrecognized titles stay ambiguous. Never output or persist titles.
      $windowText = $null
    }
    if ([ForegroundApp]::Id() -ne $foregroundId) { throw 'Foreground changed' }
    @{ name = $foregroundName; hint = $hint; domain = $domain; executable = $executable; sensitive = $sensitive } | ConvertTo-Json -Compress
  } catch { '{"name":null}' }
  Start-Sleep -Seconds 2
}
