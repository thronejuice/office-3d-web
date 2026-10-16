import { rankOf, suitOf, type Card } from '@office3d/shared';

const RANK = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_NAME = ['ดอกจิก', 'ข้าวหลามตัด', 'โพแดง', 'โพดำ']; // clubs, diamonds, hearts, spades (matches Card suit order c,d,h,s)
const RED = new Set([1, 2]);

// Suit shapes drawn in a 24x24 box.
const SUIT_PATH: Record<number, string> = {
  2: 'M12 21s-7-4.6-9.2-9.1C1.3 8.6 3 5 6.2 5c2 0 3.5 1.1 5.8 3.4C14.3 6.1 15.8 5 17.8 5 21 5 22.7 8.6 21.2 11.9 19 16.4 12 21 12 21z',
  1: 'M12 2l8 10-8 10-8-10z',
  3: 'M12 2C9 7 3 9.5 3 14.2 3 17 5.2 19 7.8 19c1.6 0 3-.7 4.2-2-.2 2-.9 3.8-2.4 5h4.8c-1.5-1.2-2.2-3-2.4-5 1.2 1.3 2.6 2 4.2 2 2.6 0 4.8-2 4.8-4.8C21 9.5 15 7 12 2z',
  0: 'M12 3a4.5 4.5 0 0 1 3.4 7.5A4.5 4.5 0 1 1 13.2 17l1.3 5h-5l1.3-5A4.5 4.5 0 1 1 8.6 10.5 4.5 4.5 0 0 1 12 3z',
};

const INK = '#1d2433';
const RED_INK = '#c9354e';

/** A playing card face, or the back when `card` is negative. Pure SVG, no image files. */
export function PlayingCard({ card, size = 'md' }: { card: Card; size?: 'sm' | 'md' | 'lg' }) {
  const w = size === 'lg' ? 72 : size === 'md' ? 52 : 38;
  const h = Math.round(w * 1.4);
  if (card < 0) {
    return (
      <svg className="pcard" width={w} height={h} viewBox="0 0 50 70" role="img" aria-label="ไพ่คว่ำ">
        <rect x="1" y="1" width="48" height="68" rx="6" fill="#3b6cf6" stroke="#1d3a9a" strokeWidth="2" />
        <rect x="6" y="6" width="38" height="58" rx="3" fill="none" stroke="#ffffff" strokeOpacity=".7" strokeWidth="1.5" />
        <path d="M25 14l11 21-11 21-11-21z" fill="none" stroke="#ffffff" strokeOpacity=".7" strokeWidth="1.5" />
      </svg>
    );
  }
  const r = rankOf(card), s = suitOf(card);
  const color = RED.has(s) ? RED_INK : INK;
  return (
    <svg className="pcard" width={w} height={h} viewBox="0 0 50 70" role="img" aria-label={`${RANK[r]} ${SUIT_NAME[s]}`}>
      <rect x="1" y="1" width="48" height="68" rx="6" fill="#ffffff" stroke="#9aa6b5" strokeWidth="1.5" />
      <text x="7" y="19" fontSize="16" fontWeight="700" fill={color} fontFamily="system-ui, sans-serif">{RANK[r]}</text>
      <g transform="translate(6 22) scale(.55)"><path d={SUIT_PATH[s]} fill={color} /></g>
      <g transform="translate(11 30) scale(1.2)"><path d={SUIT_PATH[s]} fill={color} /></g>
    </svg>
  );
}

/** A play-money chip with its amount. */
export function Chip({ amount }: { amount: number }) {
  return (
    <span className="chip-amt">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10.5" fill="#f2a93b" stroke="#a56a0a" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 2.4" />
      </svg>
      {amount.toLocaleString('th-TH')}
    </span>
  );
}
