import React from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { type, usePalette } from '../../theme';

/** Settings-style form cell: label on the left, input aligned right. */
export function FormRow({ label, ...input }: { label: string } & TextInputProps) {
  const c = usePalette();
  return (
    <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
      <Text style={[type.body, { color: c.label, minWidth: 72 }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.tertiaryLabel}
        selectionColor={c.accent}
        {...input}
        style={[type.body, { flex: 1, color: c.label, textAlign: 'right', paddingVertical: 12 }]}
      />
    </View>
  );
}

/** A cell that just holds arbitrary content with standard padding. */
export function CellBox({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return <View style={padded ? { paddingHorizontal: 16, paddingVertical: 12 } : undefined}>{children}</View>;
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        justifyContent: 'center',
        backgroundColor: selected ? c.label : c.fill,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={[type.footnote, { fontWeight: '500', color: selected ? c.card : c.label }]}>{label}</Text>
    </Pressable>
  );
}
