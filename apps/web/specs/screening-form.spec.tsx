import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MetricCatalogItem } from '@erp/contracts';
import { ScreeningForm } from '../src/components/screening-form';

const catalog: MetricCatalogItem[] = [
  { metricCode: 'NET_MARGIN', formulaVersion: '1.0.0', metricName: 'Biên lợi nhuận ròng', formulaText: 'NI[t]/R[t]', displayUnit: 'PERCENT', inputCount: 2, requiresPrevious: false },
  { metricCode: 'CURRENT_RATIO', formulaVersion: '1.0.0', metricName: 'Khả năng thanh toán hiện hành', formulaText: 'CA[t]/CL[t]', displayUnit: 'TIMES', inputCount: 2, requiresPrevious: false },
];
const defaults = { year: 2024, conditions: [{ metric: 'NET_MARGIN', op: '>=' as const, value: 10 }] };

describe('ScreeningForm', () => {
  it('submits parsed values in display units', async () => {
    const onSubmit = vi.fn();
    render(<ScreeningForm catalog={catalog} defaultValues={defaults} onSubmit={onSubmit} />);
    expect(screen.getByText('%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sàng lọc' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ year: 2024, conditions: [{ metric: 'NET_MARGIN', op: '>=', value: 10 }] });
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
    render(<ScreeningForm catalog={catalog} defaultValues={{ year: 2024, conditions: [defaults.conditions[0], defaults.conditions[0]] }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sàng lọc' }));
    expect(await screen.findByText('Có điều kiện bị lặp (cùng chỉ số và toán tử)')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a server-side validation message', () => {
    render(<ScreeningForm catalog={catalog} defaultValues={defaults} onSubmit={vi.fn()} serverError="Chỉ số không tồn tại trong danh mục công thức hiện hành." />);
    expect(screen.getByRole('alert').textContent).toContain('Chỉ số không tồn tại');
  });
});
