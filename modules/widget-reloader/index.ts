import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type WidgetReloaderNative = { reloadAll(): void };

// Missing on web, Android, Expo Go and IPAs built before this module existed: calls become no-ops.
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<WidgetReloaderNative>('WidgetReloader') : null;

/** Ask iOS to refetch the widgets. Call only after the Worker confirmed the new data is saved. */
export function reloadWidgets(): void {
  try {
    native?.reloadAll();
  } catch {
    // Never let a widget refresh break the ledger flow
  }
}
