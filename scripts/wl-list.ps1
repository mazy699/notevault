param([string]$Match = "")
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$count = 0
foreach ($el in $all) {
  $n = $el.Current.Name
  if ($n -and $n.Contains($Match)) {
    Write-Output ("[" + $el.Current.ControlType.ProgrammaticName + "] " + $n)
    $count++
    if ($count -ge 40) { break }
  }
}
Write-Output ("COUNT=" + $count)
