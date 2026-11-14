import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScreeningForm } from '../src/components/screening-form';
import type { ScreeningMetric } from '../src/lib/screening-form';

const catalog: ScreeningMetric[] = [
  { metricCode: 'NET_MARGIN', metricName: 'Biên lợi nhuận ròng', displayUnit: 'PERCENT', group: 'FINANCIAL' },
  { metricCode: 'CURRENT_RATIO', metricName: 'Khả năng thanh toán hiện hành', displayUnit: 'TIMES', group: 'FINANCIAL' },
  { metricCode: 'PE', metricName: 'P/E', displayUnit: 'TIMES', group: 'VALUATION' },
  { metricCode: 'MARKET_CAP', metricName: 'Vốn hóa', displayUnit: 'VND', group: 'VALUATION' },
  { metricCode: 'RETURN_1Y', metricName: 'Lợi suất 1 năm', displayUnit: 'PERCENT', group: 'MARKET' },
];
const defaults = { mode: 'year' as const, year: 2024, date: '', conditions: [{ metric: 'NET_MARGIN', op: '>=' as const, value: 10 }] };

describe('ScreeningForm', () => {
  it('submits parsed values in display units', async () => {
    const onSubmit = vi.fn();
    render(<ScreeningForm catalog={catalog} defaultValues={defaults} onSubmit={onSubmit} />);
    expect(screen.getByText('%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sàng lọc' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ mode: 'year', year: 2024, date: '', conditions: [{ metric: 'NET_MARGIN', op: '>=', value: 10 }] });
  });

  it('adds and removes conditions, keeping at least one', () => {
    render(<ScreeningForm catalog={catalog} defaultValues={defaults} onSubmit={vi.fn()} />);
    expect(screen.getAllByTestId('condition-row')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Xóa điều kiện 1' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm điều kiện' }));
    expect(screen.getAllByTestId('condition-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa điều kiện 2' }));
    expect(screen.getAllByTestId('condition-row')).toHaveLength(1);
  });

  it('shows field errors instead of submitting invalid input', async () => {
    const onSubmit = vi.fn();
    render(<ScreeningForm catalog={catalog} defaultValues={defaults} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm điều kiện' }));
    fireEvent.change(screen.getByLabelText('Ngưỡng điều kiện 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sàng lọc' }));
    expect(await screen.findByText('Chọn chỉ số')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects duplicate conditions', async () => {
    const onSubmit = vi.fn();
    render(<ScreeningForm catalog={catalog} defaultValues={{ ...defaults, conditions: [defaults.conditions[0], defaults.conditions[0]] }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sàng lọc' }));
    expect(await screen.findByText('Có điều kiện bị lặp (cùng chỉ số và toán tử)')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server-side validation message', () => {
    render(<ScreeningForm catalog={catalog} defaultValues={defaults} onSubmit={vi.fn()} serverError="Chỉ số không tồn tại trong danh mục công thức hiện hành." />);
    expect(screen.getByRole('alert').textContent).toContain('Chỉ số không tồn tại');
  });

  it('offers valuation and market metrics only in date mode, grouped, with their units', async () => {
    const onSubmit = vi.fn();
    const date = { mode: 'date' as const, year: 2024, date: '2025-06-30', conditions: [{ metric: 'MARKET_CAP', op: '>=' as const, value: 100000 }] };
    const { container } = render(<ScreeningForm catalog={catalog} defaultValues={date} onSubmit={onSubmit} />);
    expect([...container.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Tài chính', 'Định giá', 'Thị trường']);
    expect(screen.getByText('tỷ đồng')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sàng lọc' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ mode: 'date', date: '2025-06-30' });
  });

  it('rejects a market metric in year mode and an invalid date in date mode', async () => {
    const onSubmit = vi.fn();
    render(<ScreeningForm catalog={catalog} defaultValues={{ ...defaults, conditions: [{ metric: 'PE', op: '<=', value: 12 }] }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sàng lọc' }));
    expect(await screen.findByText('Chỉ số định giá/thị trường chỉ dùng ở chế độ theo ngày')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a real calendar date in date mode', async () => {
    const onSubmit = vi.fn();
    render(<ScreeningForm catalog={catalog} defaultValues={{ ...defaults, mode: 'date', date: '' }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sàng lọc' }));
    expect(await screen.findByText('Chọn một ngày hợp lệ')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
