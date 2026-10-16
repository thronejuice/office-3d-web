import { cardColor, cardValue, type UnoCard, type UnoColor } from '@office3d/shared';

// Fills chosen so the card symbols reach 4.5:1: white on red, green and blue, dark ink on yellow.
export const UNO_FILL: Record<UnoColor, string> = { r: '#c9354e', y: '#f2b01e', g: '#1f7d4e', b: '#3b6cf6' };
const inkOn = (c: UnoColor | 'w') => (c === 'y' ? '#1d2433' : '#ffffff');
export const COLOR_NAME: Record<UnoColor, string> = { r: 'แดง', y: 'เหลือง', g: 'เขียว', b: 'น้ำเงิน' };
const VALUE_NAME: Record<string, string> = { S: 'ข้าม', R: 'กลับทิศ', D: 'จั่วสอง', W: 'เปลี่ยนสี', F: 'เปลี่ยนสีและจั่วสี่' };

export function unoName(c: UnoCard): string {
  const col = cardColor(c), v = cardValue(c);
  return col === 'w' ? VALUE_NAME[v] : `${COLOR_NAME[col]} ${VALUE_NAME[v] ?? v}`;
}

/** Each colour also has its own shape, so the cards never rely on colour alone. */
export function ColorShape({ color, size = 14, stroke = '#fff' }: { color: UnoColor; size?: number; stroke?: string }) {
  const fill = UNO_FILL[color];
  const s = { fill, stroke, strokeWidth: 1.5 } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {color === 'r' && <circle cx="10" cy="10" r="7.5" {...s} />}
      {color === 'y' && <path d="M10 2.5l8 14H2z" {...s} />}
      {color === 'g' && <rect x="3" y="3" width="14" height="14" rx="1.5" {...s} />}
      {color === 'b' && <path d="M10 2l8 8-8 8-8-8z" {...s} />}
    </svg>
  );
}

const WILD_QUADS: [UnoColor, string][] = [['r', 'M30 45V12a33 33 0 0 1 26 33z'], ['b', 'M30 45h26a33 33 0 0 1-26 33z'], ['y', 'M30 45v33A33 33 0 0 1 4 45z'], ['g', 'M30 45H4A33 33 0 0 1 30 12z']];

/** An Uno card as inline SVG; `card` null draws the back. */
export function UnoCardView({ card, size = 'md' }: { card: UnoCard | null; size?: 'sm' | 'md' | 'lg' }) {
  const w = size === 'lg' ? 72 : size === 'md' ? 54 : 36;
  const h = Math.round(w * 1.5);
  if (!card) {
    return (
      <svg className="ucard" width={w} height={h} viewBox="0 0 60 90" role="img" aria-label="ไพ่คว่ำ">
        <rect x="1.5" y="1.5" width="57" height="87" rx="8" fill="#1d2433" stroke="#fff" strokeWidth="3" />
        <ellipse cx="30" cy="45" rx="22" ry="34" transform="rotate(30 30 45)" fill="#d6455d" />
        <text x="30" y="52" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">UNO</text>
      </svg>
    );
  }
  const col = cardColor(card), v = cardValue(card);
  const bg = col === 'w' ? '#1d2433' : UNO_FILL[col];
  const ink = inkOn(col);
  const label = v === 'D' ? '+2' : v === 'F' ? '+4' : /\d/.test(v) ? v : '';
  return (
    <svg className="ucard" width={w} height={h} viewBox="0 0 60 90" role="img" aria-label={unoName(card)}>
      <rect x="1.5" y="1.5" width="57" height="87" rx="8" fill={bg} stroke="#fff" strokeWidth="3" />
      {col === 'w' ? (
        <g transform="translate(0 0)">{WILD_QUADS.map(([c, d]) => <path key={c} d={d} fill={UNO_FILL[c]} stroke="#fff" strokeWidth="1.5" />)}</g>
      ) : (
        <ellipse cx="30" cy="45" rx="20" ry="32" transform="rotate(25 30 45)" fill={col === 'y' ? '#ffffff55' : '#ffffff22'} />
      )}
      {v === 'S' && <g fill="none" stroke={ink} strokeWidth="5"><circle cx="30" cy="45" r="15" /><path d="M19 56L41 34" /></g>}
      {v === 'R' && <g fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 38h20l-6-7M40 52H20l6 7" /></g>}
      {v === 'W' && <circle cx="30" cy="45" r="6" fill="#fff" />}
      {label && <text x="30" y={col === 'w' ? 92 : 56} textAnchor="middle" fontSize={label.length > 1 ? 26 : 34} fontWeight="800" fill={ink} stroke={col === 'y' ? '#ffffff55' : '#00000055'} strokeWidth=".8" fontFamily="system-ui, sans-serif" transform={col === 'w' ? 'translate(0 -37)' : undefined}>{label}</text>}
      {col !== 'w' && <g transform="translate(5 5)"><ColorShape color={col} size={12} stroke={ink} /></g>}
    </svg>
  );
}
