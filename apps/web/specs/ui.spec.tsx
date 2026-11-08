import { render, screen } from '@testing-library/react';
import { ErrorBox } from '../src/components/ui';
import { ApiError } from '../src/lib/api';
import { METRIC_STATUS, OUTCOME, labelOf } from '../src/lib/labels';

describe('shared UI', () => {
  it('shows the API message and the request id, never raw Oracle text', () => {
    render(<ErrorBox error={new ApiError(400, 'UNKNOWN_METRIC', 'Chỉ số không tồn tại.', 'web-123', ['metric sai'])} />);
    expect(screen.getByRole('alert').textContent).toContain('Chỉ số không tồn tại.');
    expect(screen.getByText('Mã yêu cầu: web-123')).toBeTruthy();
    expect(screen.getByText('metric sai')).toBeTruthy();
  });
  it('falls back to a generic message for unknown errors', () => {
    render(<ErrorBox error={new Error('ORA-00942 secret')} />);
    expect(screen.getByRole('alert').textContent).not.toContain('ORA-');
  });
  it('labels every status in Vietnamese with a tone', () => {
    expect(labelOf(METRIC_STATUS, 'BLOCKED_INPUT_QUALITY')).toMatchObject({ text: 'Bị chặn do chất lượng', tone: 'bad' });
    expect(OUTCOME.UNKNOWN.text).toBe('Chưa xác định');
    expect(labelOf(METRIC_STATUS, 'SOMETHING_NEW').text).toBe('SOMETHING_NEW');
  });
});
