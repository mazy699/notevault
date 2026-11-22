# Worklog 桌面 GUI 自动化辅助：UIA 按名称查找并 Invoke（参数：名称片段）
param([string]$Name)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
$el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
if (-not $el) { Write-Output "NOT-FOUND"; exit 1 }
$pat = $null
if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pat)) {
  $pat.Invoke()
  Write-Output "INVOKED"
} else {
  Write-Output ("FOUND-NO-INVOKE: " + $el.Current.ControlType.ProgrammaticName)
}
