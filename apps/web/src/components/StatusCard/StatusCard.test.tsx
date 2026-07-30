import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusCard } from './StatusCard';

describe('StatusCard', () => {
  it('renders the title and status', () => {
    render(<StatusCard title="Database" status="Online" />);

    expect(
      screen.getByRole('heading', { name: 'Database' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});
