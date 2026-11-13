import React from 'react';
import { Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { tabular, type, usePalette } from '../../theme';
import { Icon } from './Icon';

/** Plain text field on a fill background (search bar / form field look). */
export function Field({
  style,
  ...props
}: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const c = usePalette();
  return (
    <View style={[{ height: 40, borderRadius: 10, backgroundColor: c.fill, paddingHorizontal: 12, justifyContent: 'center' }, style]}>
      <TextInput
        placeholderTextColor={c.tertiaryLabel}
        selectionColor={c.accent}
        {...props}
        style={[type.body, { color: c.label, padding: 0 }]}
      />
    </View>
  );
}

/** Large centered amount input ("$ 0") used in sheets. */
export function AmountField({
  value,
  onChangeText,
  autoFocus,
  placeholder = '0',
  color,
}: {
  value: string;
  onChangeText: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  color?: string;
}) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}>
      <Text style={{ fontSize: 34, fontWeight: '600', color: c.tertiaryLabel, marginRight: 4 }}>$</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9.]/g, ''))}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={c.tertiaryLabel}
        selectionColor={c.accent}
        style={{
          fontSize: 48,
          fontWeight: '700',
          letterSpacing: -1,
          color: color ?? c.label,
          width: Math.max(1, (value || placeholder).length) * 30 + 12,
          padding: 0,
          textAlign: 'center',
          ...tabular,
        }}
      />
    </View>
  );
}

export function SearchField({ value, onChangeText, placeholder = '搜尋' }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  const c = usePalette();
  return (
    <View style={{ height: 36, borderRadius: 10, backgroundColor: c.fill, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name="search" size={15} color={c.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.secondaryLabel}
        selectionColor={c.accent}
        clearButtonMode="while-editing"
        style={[type.body, { flex: 1, color: c.label, padding: 0 }]}
      />
    </View>
  );
}
