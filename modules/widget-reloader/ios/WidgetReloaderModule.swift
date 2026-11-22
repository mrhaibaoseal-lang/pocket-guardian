import ExpoModulesCore
import WidgetKit

/// Lets the app tell iOS "the cloud has new numbers, redraw the widgets now".
/// Reloads requested while the app is in the foreground do not count against the widget refresh budget.
public class WidgetReloaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetReloader")

    Function("reloadAll") {
      DispatchQueue.main.async {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
