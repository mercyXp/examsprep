import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — ExamsPrep",
  description: "How ExamsPrep collects, uses, and stores account and learning information.",
};

export default function PrivacyPage() {
  return (
    <article className="legal-page" aria-labelledby="privacy-title">
      <header className="features-page-head">
        <p className="features-kicker">ExamsPrep</p>
        <h1 id="privacy-title" className="features-page-title">
          Privacy policy
        </h1>
        <p className="features-page-lede">
          This page explains what ExamsPrep stores when you create an account, study, or sign in with Google, and what we do with it.
        </p>
        <p className="legal-updated">Last updated 28 October 2026.</p>
      </header>

      <section className="legal-section">
        <h2>Who we are</h2>
        <p>
          ExamsPrep is an independent exam-preparation site at examsprep.xyz. It helps you revise with lessons, quizzes, and a study plan. Choosing a programme, year, or semester here does not enrol you at a university and does not decide your academic standing.
        </p>
      </section>

      <section className="legal-section">
        <h2>Information we collect</h2>
        <ul>
          <li>Account details: your name, email address, and a hashed password if you create one.</li>
          <li>Google sign-in: your name and email address, after Google confirms the sign-in. We do not receive your Google password.</li>
          <li>Study choices: the programme, year, and semester you select, the modules you add (up to seven active modules), and modules you later remove.</li>
          <li>Learning activity: lesson progress, quiz results, and the last time you signed in.</li>
          <li>Staff records, if you are invited: your role, invitation status, and an audit note of staff actions such as an invitation or a role change.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>How we use it</h2>
        <p>We use this information to run your account and the learning tools you open.</p>
        <ul>
          <li>Sign you in and keep you signed in on this device.</li>
          <li>Show the modules you selected, your progress, and your study plan.</li>
          <li>Send a password-reset link, a staff invitation, or a short notice when your password or staff access changes.</li>
          <li>Keep the site reliable and look into misuse of an account.</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </section>

      <section className="legal-section">
        <h2>Google sign-in</h2>
        <p>
          If you choose Continue with Google, Google shows its own account window. ExamsPrep then checks the sign-in with Google and stores the name and verified email on your account. A new Google account is created as a student. An existing account keeps the role it already has. Google’s own privacy policy covers what Google collects in that window.
        </p>
      </section>

      <section className="legal-section">
        <h2>Cookies</h2>
        <p>
          After you sign in, the site stores a session cookie named examsprep_token. It tells the site who you are on later visits. Signing out of this device clears it. We do not use that cookie to advertise to you on other sites.
        </p>
      </section>

      <section className="legal-section">
        <h2>Email</h2>
        <p>
          Password-reset messages, staff invitations, and account-security notices are sent through our email provider, Resend. A reset link expires after 15 minutes and works once. An invitation link expires after 24 hours and works once. We store only a hash of those links, not the link itself.
        </p>
      </section>

      <section className="legal-section">
        <h2>Who else sees it</h2>
        <p>We share information only as needed to run ExamsPrep:</p>
        <ul>
          <li>Google, when you choose Google sign-in.</li>
          <li>Resend, to deliver the emails described above.</li>
          <li>The companies that host the website, the API, and the database.</li>
          <li>Staff who need it to manage the catalogue, invitations, or support for your account.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>How long we keep it</h2>
        <p>
          We keep your account, course selections, and learning history while the account is open, so progress is still there when you come back. Removed modules stay in your learning history and no longer take a place on your dashboard. Password-reset and invitation links are single-use and expire on the times above.
        </p>
      </section>

      <section className="legal-section">
        <h2>Your choices</h2>
        <ul>
          <li>Update your name and password in Settings.</li>
          <li>Add or remove active modules in Settings, up to seven at a time.</li>
          <li>Sign out of this device, which clears the session cookie.</li>
          <li>Ask us to correct or delete your account by writing to the address below.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Children</h2>
        <p>
          ExamsPrep is for university exam preparation. It is not directed at children under 16, and we do not knowingly create accounts for them.
        </p>
      </section>

      <section className="legal-section">
        <h2>Changes</h2>
        <p>
          If this policy changes, the updated page will show a new date at the top. Continuing to use ExamsPrep after that date means the new policy applies to your account.
        </p>
      </section>

      <section className="legal-section">
        <h2>Contact</h2>
        <p>
          Questions about this policy or your account:{" "}
          <a href="mailto:privacy@examsprep.xyz">privacy@examsprep.xyz</a>.
        </p>
      </section>
    </article>
  );
}
