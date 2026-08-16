export default function LaunchSplash() {
  return (
    <main className="launch-splash" role="status" aria-live="polite" aria-label="Preparing Fantasy Hub">
      <div className="launch-splash-glow" aria-hidden="true" />
      <section className="launch-splash-lockup">
        <div className="launch-splash-logo">
          <span aria-hidden="true" />
          <img src="/fantasy-hub-logo-cropped.png" alt="Fantasy Hub" />
        </div>
        <p>Preparing your hub</p>
        <div className="launch-splash-dots" aria-hidden="true"><i /><i /><i /></div>
      </section>
    </main>
  );
}
