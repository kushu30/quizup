import { describe, expect, it } from 'vitest';
import { renderHostAccessEmail, renderTokenEmail } from './templates.js';

const APP = 'https://quizup.example';

const BASE = {
  studentName: 'Asha Rao',
  quizTitle: 'Database systems mid-term',
  joinCode: 'ABC234',
  token: 'K5B8J-AH9JV',
  appUrl: 'https://quizup.example/',
};

const BRAND = {
  institutionName: 'Dayananda Sagar College of Engineering',
  logoUrl: 'https://cdn.example/dsce.png',
  brandColor: '#7A1F2B',
};

const LINK = 'https://quizup.example/join/ABC234#token=K5B8J-AH9JV';

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? '');
}

describe('renderTokenEmail wording', () => {
  it('uses a plain, professional default message with the student and quiz filled in', () => {
    const mail = renderTokenEmail(BASE);
    expect(mail.subject).toBe('Your access to Database systems mid-term');
    expect(mail.text).toContain('Hello Asha Rao,');
    expect(mail.text).toContain('You have been invited to take Database systems mid-term.');
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain('Join code: ABC234');
    expect(mail.text).toContain('Access token: K5B8J-AH9JV');
    expect(mail.text).toMatch(/do not share/i);
    expect(mail.text).not.toMatch(/undefined|\{\{/);
  });

  it('puts the host-written subject and message in, with placeholders filled', () => {
    const mail = renderTokenEmail({
      ...BASE,
      brand: BRAND,
      subject: '{{institution_name}}: {{quiz_title}} on Friday',
      message:
        'Dear {{student_name}},\n\nBring a charged laptop.\nYour code is {{join_code}}.\n\nOpen {{join_link}} when the exam starts.',
    });
    expect(mail.subject).toBe(
      'Dayananda Sagar College of Engineering: Database systems mid-term on Friday',
    );
    expect(mail.text).toContain('Dear Asha Rao,');
    expect(mail.text).toContain('Your code is ABC234.');
    expect(mail.html).toContain('Dear Asha Rao,');
    expect(mail.html).toContain('Bring a charged laptop.<br>Your code is ABC234.');
    expect(mail.html).toContain(`<a href="${LINK}"`);
  });

  it('keeps line breaks out of the subject', () => {
    const mail = renderTokenEmail({ ...BASE, quizTitle: 'Line one\r\nBcc: x@evil.test' });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('escapes everything a host or student could type', () => {
    const mail = renderTokenEmail({
      ...BASE,
      studentName: '<script>alert(1)</script>',
      quizTitle: 'Q & A "quiz" <b>',
      brand: {
        institutionName: '<img src=x onerror=alert(1)>',
        logoUrl: 'https://cdn.example/a"b.png',
      },
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('Q &amp; A &quot;quiz&quot;');
    expect(mail.html).not.toContain('a"b.png');
  });
});

describe('renderTokenEmail message', () => {
  it('shows tags typed into the message as plain text', () => {
    const mail = renderTokenEmail({
      ...BASE,
      message: 'Hi {{student_name}} <i>there</i> & welcome',
    });
    expect(mail.html).not.toContain('<i>there');
    expect(mail.html).toContain('&lt;i&gt;there&lt;/i&gt; &amp; welcome');
  });
});

describe('renderTokenEmail branding', () => {
  it('shows only the QuizUp logo for a quiz without an institution', () => {
    const mail = renderTokenEmail(BASE);
    expect(mail.html).toContain(`src="${APP}/email/quizup-logo-dark.png"`);
    expect(mail.html).toContain('alt="QuizUp"');
    expect(mail.html).not.toMatch(/powered by/i);
    expect(mail.html).not.toContain('cdn.example');
  });

  it('shows the institution logo and name, then Powered by the QuizUp logo', () => {
    const mail = renderTokenEmail({ ...BASE, brand: BRAND });
    expect(mail.html).toContain('src="https://cdn.example/dsce.png"');
    expect(mail.html).toContain('alt="Dayananda Sagar College of Engineering"');
    expect(mail.html).toContain('Dayananda Sagar College of Engineering');
    expect(mail.html).toMatch(/Powered by/);
    expect(mail.html).toContain(`src="${APP}/email/quizup-logo-light.png"`);
    expect(mail.html.indexOf('cdn.example/dsce.png')).toBeLessThan(mail.html.indexOf('Powered by'));
    expect(mail.html).toContain('background:#7A1F2B');
  });

  it('shows the name alone when the institution has no logo', () => {
    const mail = renderTokenEmail({ ...BASE, brand: { institutionName: 'Lincoln High' } });
    expect(mail.html).toContain('Lincoln High');
    expect(mail.html).toMatch(/Powered by/);
    expect(mail.html).not.toContain('cdn.example');
  });

  it('keeps text readable on a bright brand colour by switching to dark text and the dark logo', () => {
    const mail = renderTokenEmail({
      ...BASE,
      brand: { institutionName: 'Sunny School', brandColor: '#FFFF00' },
    });
    expect(mail.html).toContain('background:#FFFF00');
    expect(mail.html).toContain('color:#1c2533');
    expect(mail.html).toContain(`src="${APP}/email/quizup-logo-dark.png"`);
    expect(mail.html).not.toContain('quizup-logo-light.png');
    expect(mail.html).not.toMatch(/color:#FFFF00/);
  });

  it('never uses a logo that is not https, or a colour that is not a hex colour', () => {
    const mail = renderTokenEmail({
      ...BASE,
      brand: {
        institutionName: 'Lincoln High',
        logoUrl: 'http://cdn.example/plain.png',
        brandColor: 'red; background:url(x)',
      },
    });
    expect(mail.html).not.toContain('plain.png');
    expect(mail.html).not.toContain('background:url');
    expect(mail.html).toContain('background:#1e5446');
  });
});

describe('renderTokenEmail structure', () => {
  it('has a button and a plain fallback link, all absolute', () => {
    const mail = renderTokenEmail({ ...BASE, brand: BRAND });
    const links = hrefs(mail.html);
    expect(links).toContain(LINK);
    expect(links.filter((href) => href === LINK).length).toBeGreaterThanOrEqual(2);
    for (const href of links) {
      expect(href).toMatch(/^(https:\/\/|mailto:)/);
    }
    expect(mail.html).toContain('Open my personal link');
    expect(mail.html).toMatch(/copy this link/i);
  });

  it('gives every image a size and alt text so it reads with images blocked', () => {
    const mail = renderTokenEmail({ ...BASE, brand: BRAND });
    const images = [...mail.html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
    expect(images.length).toBeGreaterThanOrEqual(2);
    for (const image of images) {
      expect(image).toMatch(/alt="[^"]+"/);
      expect(image).toMatch(/width="\d+"/);
      expect(image).toMatch(/height="\d+"/);
    }
  });

  it('is a complete, table based, single column document', () => {
    const mail = renderTokenEmail(BASE);
    expect(mail.html.startsWith('<!doctype html>')).toBe(true);
    expect(mail.html).toContain('<meta name="viewport"');
    expect(mail.html).toContain('role="presentation"');
    expect(mail.html).not.toMatch(/undefined|\{\{/);
  });
});

describe('renderHostAccessEmail', () => {
  const input = { appUrl: 'https://quizup.example', contactEmail: 'help@example.com' };

  it('tells the new host plainly what changed and where to go', () => {
    const mail = renderHostAccessEmail(input);
    expect(mail.subject).toBe('You can now host quizzes on QuizUp');
    expect(mail.text).toContain('Your account now has host access.');
    expect(mail.text).toContain('https://quizup.example/host');
    expect(mail.text).toContain('help@example.com');
    expect(mail.text).toMatch(/sign in/i);
    expect(mail.text).toMatch(/not expecting|did not expect/i);
    expect(mail.text).not.toMatch(/good news/i);
  });

  it('carries the QuizUp logo and absolute links only', () => {
    const mail = renderHostAccessEmail(input);
    expect(mail.html).toContain('src="https://quizup.example/email/quizup-logo-dark.png"');
    expect(mail.html).toContain('href="https://quizup.example/host"');
    expect(mail.html).toContain('href="mailto:help@example.com"');
    for (const href of hrefs(mail.html)) {
      expect(href).toMatch(/^(https:\/\/|mailto:)/);
    }
  });
});
