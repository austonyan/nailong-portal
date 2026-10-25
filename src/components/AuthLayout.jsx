import { Background } from 'animal-island-ui';

// Full-page sprinkle wallpaper with a centered parchment card for auth screens.
export default function AuthLayout({ children, width = 400 }) {
  return (
    <Background
      type="sprinkles"
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div className="auth-card" style={{ width }}>
        {children}
      </div>
    </Background>
  );
}
