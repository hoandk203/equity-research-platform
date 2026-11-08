'use client';
import { MAX_COMPARE_SYMBOLS } from '@erp/contracts';
import { useAppDispatch, useAppSelector } from '../store/store';
import { compareBasket } from '../store/slices';

export function CompareButton({ symbol }: { symbol: string }) {
  const symbols = useAppSelector((s) => s.compareBasket.symbols);
  const dispatch = useAppDispatch();
  const selected = symbols.includes(symbol);
  const full = !selected && symbols.length >= MAX_COMPARE_SYMBOLS;
  return (
    <button
      type="button"
      className={selected ? 'btn btn-secondary is-on' : 'btn btn-secondary'}
      onClick={() => dispatch(compareBasket.actions.toggle(symbol))}
      disabled={full}
      aria-pressed={selected}
      title={full ? `Giỏ so sánh tối đa ${MAX_COMPARE_SYMBOLS} mã` : undefined}
    >
      {selected ? '✓ Trong giỏ so sánh' : '+ So sánh'}
    </button>
  );
}
