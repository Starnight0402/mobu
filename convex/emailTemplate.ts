/**
 * Shared branded email shell for both OTP flows (sign-in and password
 * reset). Table-based layout with inline styles rather than <style>/flex —
 * that's what actually survives Gmail/Outlook's HTML stripping, unlike the
 * app's own Tailwind-based components.
 */
export function otpEmailHtml(opts: { heading: string; subheading: string; code: string }): string {
  const { heading, subheading, code } = opts;
  const spacedCode = code.split("").join(" ");
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background-color:#0a0a0a;border:1px solid #232323;border-radius:24px;">
            <tr>
              <td align="center" style="padding:40px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:56px;height:56px;border-radius:16px;background-color:#a855f7;" align="center" valign="middle">
                      <div style="width:26px;height:26px;border-radius:13px;background-color:#ffffff;margin:15px auto;"></div>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;font-family:'Courier New',Courier,monospace;letter-spacing:-1px;text-transform:uppercase;font-size:22px;font-weight:700;color:#ffffff;">
                  Mobu
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 4px;">
                <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a8a8a;">
                  ${heading}
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 32px 4px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.35);border-radius:16px;">
                  <tr>
                    <td style="padding:22px 28px;">
                      <span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:4px;color:#c084fc;white-space:nowrap;">
                        ${spacedCode}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 32px 40px;">
                <p style="margin:0;font-size:13px;line-height:1.7;color:#8a8a8a;">
                  ${subheading}<br />If you didn't request this, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0;font-size:11px;letter-spacing:1px;color:#3a3a3a;">
            Mobu &mdash; a private space for two.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function otpEmailText(opts: { heading: string; subheading: string; code: string }): string {
  const { heading, subheading, code } = opts;
  return `${heading}\n\nYour code: ${code}\n\n${subheading}\nIf you didn't request this, you can safely ignore this email.`;
}
