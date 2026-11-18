const esc = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char]);

const icon = name => {
  const paths = {
    question: '<path d="M9.2 9a3 3 0 1 1 5.1 2.1c-1.1 1-2.3 1.5-2.3 3.4"/><path d="M12 18h.01"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3"/>',
    progress: '<path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/>',
    topic: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2m10 8h-2M4 12H2m10 10v-2"/>',
    notes: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 1 5 17.5z"/><path d="M5 5v13M9 7h7m-7 4h7m-7 4h5"/>',
    insight: '<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
    aspirant: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 3 9 3 12 0v-5M22 9v6"/>',
    university: '<path d="M3 21h18M4 10h16M12 3 2 8h20z"/><path d="M6 10v8m4-8v8m4-8v8m4-8v8"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
};

export function landingNavigation(authPage = false) {
  return `<header class="landing-header ${authPage ? "auth-site-header" : ""}"><a class="landing-brand" href="/" aria-label="Seomtorch home"><img src="assets/seomtorch_logo.png" alt="Seomtorch" width="84" height="84"></a>
    <nav class="landing-nav" id="landing-navigation" aria-label="Main navigation"><a href="/#top">Home</a><a href="/#how-it-works">How it works</a><a href="/#features">Features</a><a href="/#who-its-for">About</a></nav>
    <div class="landing-nav-actions"><a class="landing-signin" href="/sign-in" data-public-auth="sign-in">Sign in</a><a class="landing-button landing-button-small" href="/register">Get started ${icon("arrow")}</a></div>
    <button class="landing-menu-toggle" type="button" aria-label="Open navigation" aria-controls="landing-navigation" aria-expanded="false"><span></span><span></span></button>
  </header>`;
}

export function landingPage() {
  return `<main class="public-landing" id="main">
    ${landingNavigation()}
    <section class="landing-hero" id="top"><div class="landing-hero-copy"><p class="landing-eyebrow">Your learning journey starts here</p><h1>Learn smarter.<br>Prepare better.<br>Achieve more.</h1><p class="landing-lede">Seomtorch gives you the tools to practise, understand exams, and track your learning progress—from secondary school to university.</p><div class="landing-hero-actions"><a class="landing-button" href="#who-its-for">Get started ${icon("arrow")}</a><a class="landing-text-link" href="#features">Explore learning ${icon("arrow")}</a></div><p class="landing-trust-note">Built for steady progress, one focused session at a time.</p></div>
      <div class="landing-preview" aria-label="Preview of the Seomtorch student dashboard"><div class="preview-window"><div class="preview-top"><strong>SEOMTORCH</strong><span aria-label="Ready"></span></div><div class="preview-welcome"><h2>Welcome back, learner</h2><p>Ready to make progress today?</p></div><div class="preview-progress"><h3>Your learning progress</h3><strong>68%</strong><div class="preview-progress-track"><i></i></div><small>Keep building on what you know</small></div><div class="preview-continue"><h3>Continue practising</h3><p>Pick up where you left off and strengthen your understanding.</p><span>Open your study desk ${icon("arrow")}</span></div></div></div>
    </section>
    <section class="landing-section landing-section-soft" id="features"><div class="landing-section-heading"><p class="landing-eyebrow">The Seomtorch experience</p><h2>Everything you need to learn with confidence.</h2><p>From daily practice to full exam preparation, Seomtorch brings structure and useful feedback to your learning.</p></div><div class="landing-card-grid">${[
      ["question", "Practice questions", "Test your understanding with topic-based questions and clear explanations that help you learn from every answer."],
      ["timer", "Timed tests", "Build confidence with timed practice that helps you prepare for real examination conditions."],
      ["progress", "Progress tracking", "Track your performance, revisit challenging topics, and see how far you’ve come."],
    ].map(([glyph, title, copy]) => `<article class="landing-info-card"><span class="landing-card-icon icon-${glyph}">${icon(glyph)}</span><h3>${title}</h3><p>${copy}</p></article>`).join("")}</div></section>
    <section class="landing-section" id="how-it-works"><div class="landing-section-heading"><p class="landing-eyebrow">Getting started is simple</p><h2>Three simple steps to get started.</h2><p>Choose your learning path, practise consistently, and track your progress.</p></div><div class="landing-steps">${[
      ["01", "Create your account", "Set up your Seomtorch profile in a few straightforward steps."],
      ["02", "Choose your learning path", "Select exam preparation or university study to find the right resources."],
      ["03", "Practise and track progress", "Answer questions, take timed tests, and follow your development."],
    ].map(([num, title, copy]) => `<article class="landing-step"><span>${num}</span><h3>${title}</h3><p>${copy}</p></article>`).join("")}</div></section>
    <section class="landing-section landing-section-soft" id="who-its-for"><div class="landing-section-heading"><p class="landing-eyebrow">Built for every learning journey</p><h2>One platform. Two paths forward.</h2><p>Choose the Seomtorch space that fits what you’re working towards.</p></div><div class="landing-path-grid"><article class="landing-path-card"><span class="path-label aspirant-label">Secondary school</span><span class="path-icon">${icon("aspirant")}</span><h3>Prepare with confidence.</h3><p>Get ready for WAEC, NECO, JAMB and other examinations with focused practice questions, timed tests, and clear explanations.</p><div><a href="/register" data-public-auth="aspirant-register">Create an aspirant account ${icon("arrow")}</a><a class="path-signin" href="/sign-in" data-public-auth="aspirant-signin">Already have an account? Sign in</a></div></article><article class="landing-path-card"><span class="path-label university-label">University students</span><span class="path-icon">${icon("university")}</span><h3>Take your learning further.</h3><p>Strengthen your understanding of university subjects with course materials, topic-based practice, and performance insights.</p><div><a href="/register" data-public-auth="university-register">Create a university account ${icon("arrow")}</a><a class="path-signin" href="/sign-in" data-public-auth="university-signin">Already have an account? Sign in</a></div></article></div></section>
    <section class="landing-section landing-feature-row"><div class="landing-section-heading"><p class="landing-eyebrow">What you get with Seomtorch</p><h2>Make every study session count.</h2><p>Practical tools that help you prepare effectively and stay on top of your progress.</p></div><div class="landing-card-grid">${[
      ["topic", "Topic-based learning", "Break subjects into manageable topics and build understanding step by step."],
      ["notes", "Clear explanations", "Go beyond the right answer with explanations that make ideas easier to understand."],
      ["insight", "Performance insights", "See how you’re doing and identify the areas that deserve more attention."],
    ].map(([glyph, title, copy]) => `<article class="landing-info-card"><span class="landing-card-icon icon-${glyph}">${icon(glyph)}</span><h3>${title}</h3><p>${copy}</p></article>`).join("")}</div></section>
    <section class="landing-cta"><p class="landing-eyebrow">A little further, every day</p><h2>Your next learning milestone starts here.</h2><p>Start building better study habits, strengthen your understanding, and make each session count.</p><a class="landing-button" href="#who-its-for">Choose your learning path ${icon("arrow")}</a><small>For exam aspirants and university students</small></section>
    <footer class="landing-footer"><div class="landing-footer-brand"><img src="assets/seomtorch_logo.png" alt="Seomtorch" width="100" height="100"><p>Making quality learning more accessible, one student at a time.</p><span>Prepare with purpose.</span></div><div class="landing-footer-links"><div><strong>Explore</strong><a href="#top">Home</a><a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="#who-its-for">Who it’s for</a></div><div><strong>Learning paths</strong><a href="/register" data-public-auth="aspirant-register">Exam aspirants</a><a href="/register" data-public-auth="university-register">University students</a><a href="/sign-in" data-public-auth="sign-in">Sign in</a></div></div><div class="landing-footer-bottom"><span>© ${new Date().getFullYear()} Seomtorch. All rights reserved.</span><span>Built for learning with purpose.</span></div></footer>
  </main>`;
}
