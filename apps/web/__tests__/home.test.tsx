import { render, screen } from '@testing-library/react';
import Hero from '../components/home/Hero';

// The home route is an async server component that fetches destinations, so it
// cannot be rendered directly in jsdom. The marketing copy lives in `Hero`,
// which is what this test actually covers.
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
}));

describe('Home page', () => {
  it('renders the main platform heading', () => {
    render(<Hero />);
    expect(screen.getByText(/Discover beautiful places/i)).toBeInTheDocument();
  });
});
