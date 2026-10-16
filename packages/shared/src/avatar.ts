import { z } from 'zod';

export const HAIR_STYLES = ['short', 'bob', 'long', 'ponytail', 'twintails', 'bun', 'curly', 'bald'] as const;
export const EYE_STYLES = ['dot', 'round', 'happy', 'sleepy'] as const;
export const MOUTH_STYLES = ['smile', 'open', 'cat', 'flat'] as const;
export const TOP_STYLES = ['tee', 'tank', 'longsleeve', 'hoodie', 'shirt', 'suit'] as const;
export const BOTTOM_STYLES = ['pants', 'shorts', 'skirt'] as const;
export const ACCESSORY_STYLES = ['none', 'glasses', 'cap', 'beanie', 'headphones', 'bow', 'catEars'] as const;

export const SKIN_TONES = ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'] as const;
export const HAIR_COLORS = ['#1b1b1b', '#4a2f1b', '#8b5a2b', '#d4a24c', '#c0392b', '#7d3c98', '#3498db', '#ecf0f1'] as const;
export const CLOTH_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#34495e', '#ecf0f1', '#7f8c8d'] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const avatarSchema = z.object({
  skin: hex,
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: hex,
  eyes: z.enum(EYE_STYLES),
  mouth: z.enum(MOUTH_STYLES),
  blush: z.boolean(),
  top: z.enum(TOP_STYLES),
  topColor: hex,
  bottom: z.enum(BOTTOM_STYLES),
  bottomColor: hex,
  accessory: z.enum(ACCESSORY_STYLES),
  accessoryColor: hex,
});
export type AvatarConfig = z.infer<typeof avatarSchema>;

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: SKIN_TONES[1],
  hairStyle: 'short',
  hairColor: HAIR_COLORS[1],
  eyes: 'round',
  mouth: 'smile',
  blush: true,
  top: 'tee',
  topColor: CLOTH_COLORS[5],
  bottom: 'pants',
  bottomColor: CLOTH_COLORS[7],
  accessory: 'none',
  accessoryColor: CLOTH_COLORS[0],
};
