import type { ReactElement } from 'react';
import type { Piece } from '@office3d/shared';

const NAME: Record<string, string> = { P: 'เบี้ย', N: 'ม้า', B: 'โคน', R: 'เรือ', Q: 'ราชินี', K: 'ราชา' };
export const pieceLabel = (p: Piece) => (p === '' ? '' : `${NAME[p.toUpperCase()]}${p === p.toUpperCase() ? 'ขาว' : 'ดำ'}`);

// Simple silhouettes drawn on a 45x45 box; white pieces are light with a dark outline, black pieces the reverse.
const SHAPES: Record<string, ReactElement> = {
  P: <><circle cx="22.5" cy="13" r="5.5" /><path d="M16 36c0-8 3-11.5 6.5-13.5 3.5 2 6.5 5.5 6.5 13.5z" /><rect x="12" y="36" width="21" height="4" rx="2" /></>,
  R: <><rect x="10" y="36" width="25" height="4" rx="1.5" /><rect x="14" y="16" width="17" height="20" /><rect x="11" y="9" width="5" height="9" /><rect x="20" y="9" width="5" height="9" /><rect x="29" y="9" width="5" height="9" /><rect x="11" y="15" width="23" height="4" /></>,
  N: <><path d="M12 38v-8c0-6 4-11.5 9.5-13.5L18 13l4-7 3 3c10 1 16 9 16 21v8z" /><circle cx="20" cy="14" r="1.2" className="eye" /></>,
  B: <><circle cx="22.5" cy="7.5" r="2.6" /><ellipse cx="22.5" cy="17" rx="5.6" ry="8" /><path d="M15 37c0-7 3-9.5 7.5-12.5 4.5 3 7.5 5.5 7.5 12.5z" /><rect x="12" y="37" width="21" height="3.5" rx="1.5" /><path d="M22 13l4 5" className="cut" /></>,
  Q: <><path d="M9 14l5.5 13 3-15 4 14 4-14 3 15L35 14l-3 24H12z" /><circle cx="9" cy="12.5" r="2.4" /><circle cx="17.5" cy="9" r="2.4" /><circle cx="22.5" cy="8" r="2.4" /><circle cx="27.5" cy="9" r="2.4" /><circle cx="36" cy="12.5" r="2.4" /><rect x="11" y="37" width="23" height="3.5" rx="1.5" /></>,
  K: <><rect x="21" y="3" width="3" height="11" /><rect x="17" y="6.5" width="11" height="3" /><path d="M12 38c0-10 3-15 10.5-17.5C30 23 33 28 33 38z" /><rect x="11" y="37" width="23" height="3.5" rx="1.5" /></>,
};

/** A chess piece as inline SVG (no image files). */
export function PieceIcon({ piece }: { piece: Piece }) {
  if (!piece) return null;
  const white = piece === piece.toUpperCase();
  return (
    <svg className={`piece ${white ? 'white' : 'black'}`} viewBox="0 0 45 45" aria-hidden="true">
      <g strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">{SHAPES[piece.toUpperCase()]}</g>
    </svg>
  );
}
