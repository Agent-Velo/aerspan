package common

import (
	"fmt"
	"html"
	"regexp"
	"strings"
)

// EmailAction represents a primary call-to-action rendered as a button.
type EmailAction struct {
	Label string
	URL   string
}

// EmailDocument describes a complete HTML email.
//
// BodyHTML is treated as trusted HTML (it will not be escaped).
// For plain-text content, use normalizeEmailBodyHTML.
type EmailDocument struct {
	Title       string
	PreviewText string
	BodyHTML    string
	Action      *EmailAction
}

const (
	// Colors are derived from web-v2 Graphite theme (OKLCH converted to sRGB).
	emailColorBg         = "#010306" // graphite-dark background
	emailColorSurface    = "#070a0f" // graphite-dark surface
	emailColorBorder     = "#191b1d" // graphite-dark separator
	emailColorText       = "#fcfcfc" // snow
	emailColorMuted      = "#9fa5ae" // graphite-dark muted
	emailColorAccent     = "#95bdda" // graphite-dark accent
	emailColorAccentText = "#17181b" // eclipse

	emailMaxWidthPx = 600
	emailRadiusPx   = 8
)

var (
	fullHTMLDocRe = regexp.MustCompile(`(?is)<!doctype\s+html|<\s*(html|head|body)\b`)
	// A conservative HTML detector. We only treat the string as HTML when it contains
	// a familiar tag used in our emails. This avoids mis-detecting plain text like
	// "1 < 2" as HTML.
	looksLikeHTMLRe = regexp.MustCompile(`(?is)<\s*(p|div|span|br|a|table|tr|td|h1|h2|h3|ul|ol|li|strong|em|code|pre)\b`)
	stripHTMLTagsRe = regexp.MustCompile(`(?is)<[^>]+>`)
)

func isFullHTMLDocument(content string) bool {
	return fullHTMLDocRe.MatchString(content)
}

func looksLikeHTML(content string) bool {
	if strings.IndexByte(content, '<') == -1 {
		return false
	}
	return looksLikeHTMLRe.MatchString(content)
}

func normalizeEmailBodyHTML(content string) string {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return ""
	}
	if looksLikeHTML(trimmed) {
		return trimmed
	}
	// Treat as plain text.
	escaped := html.EscapeString(trimmed)
	escaped = strings.ReplaceAll(escaped, "\r\n", "\n")
	escaped = strings.ReplaceAll(escaped, "\n", "<br/>")
	return fmt.Sprintf("<p style=\"margin:0;\">%s</p>", escaped)
}

func truncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}

func previewTextFromContent(subject string, content string) string {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return subject
	}

	var preview string
	if looksLikeHTML(trimmed) {
		preview = stripHTMLTagsRe.ReplaceAllString(trimmed, " ")
		preview = html.UnescapeString(preview)
	} else {
		preview = trimmed
	}
	preview = strings.ReplaceAll(preview, "\r\n", "\n")
	preview = strings.ReplaceAll(preview, "\n", " ")
	preview = strings.Join(strings.Fields(preview), " ")
	preview = strings.TrimSpace(preview)
	if preview == "" {
		return subject
	}
	return truncateRunes(preview, 140)
}

// RenderEmailDocument renders a complete HTML document for transactional emails.
//
// The output uses a table-based layout for broad client compatibility.
func RenderEmailDocument(doc EmailDocument) string {
	title := strings.TrimSpace(doc.Title)
	if title == "" {
		title = SystemName
	}
	preview := strings.TrimSpace(doc.PreviewText)
	if preview == "" {
		preview = title
	}
	bodyHTML := strings.TrimSpace(doc.BodyHTML)

	brand := SystemName
	if strings.TrimSpace(brand) == "" {
		brand = "Aerspan"
	}

	escTitle := html.EscapeString(title)
	escPreview := html.EscapeString(preview)
	escBrand := html.EscapeString(brand)

	var b strings.Builder
	b.Grow(4096 + len(bodyHTML))

	// Basic document structure + dark color scheme hints (supported by Apple Mail/Outlook).
	b.WriteString("<!doctype html><html lang=\"en\"><head>")
	b.WriteString("<meta charset=\"UTF-8\"/>")
	b.WriteString("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>")
	b.WriteString("<meta name=\"color-scheme\" content=\"dark\"/>")
	b.WriteString("<meta name=\"supported-color-schemes\" content=\"dark\"/>")
	b.WriteString("<title>")
	b.WriteString(escTitle)
	b.WriteString("</title></head>")

	b.WriteString("<body style=\"margin:0;padding:0;background:")
	b.WriteString(emailColorBg)
	b.WriteString(";color:")
	b.WriteString(emailColorText)
	b.WriteString(";\">")

	// Preheader: improves inbox preview text, hidden in the email body.
	b.WriteString("<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;\">")
	b.WriteString(escPreview)
	b.WriteString("</div>")

	// Outer wrapper table.
	b.WriteString("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:")
	b.WriteString(emailColorBg)
	b.WriteString(";padding:28px 0;\">")
	b.WriteString("<tr><td align=\"center\" style=\"padding:0 12px;\">")

	// Container (fixed width for desktop, fluid for mobile).
	b.WriteString("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"max-width:")
	b.WriteString(fmt.Sprintf("%dpx", emailMaxWidthPx))
	b.WriteString(";\">")

	// Card.
	b.WriteString("<tr><td style=\"border:1px solid ")
	b.WriteString(emailColorBorder)
	b.WriteString(";background:")
	b.WriteString(emailColorSurface)
	b.WriteString(";border-radius:")
	b.WriteString(fmt.Sprintf("%dpx", emailRadiusPx))
	b.WriteString(";overflow:hidden;\">")

	// Accent bar.
	b.WriteString("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>")
	b.WriteString("<td style=\"height:3px;background:")
	b.WriteString(emailColorAccent)
	b.WriteString(";font-size:0;line-height:0;\">&nbsp;</td>")
	b.WriteString("</tr></table>")

	// Header.
	b.WriteString("<div style=\"padding:20px 24px 12px 24px;border-bottom:1px solid ")
	b.WriteString(emailColorBorder)
	b.WriteString(";\">")
	b.WriteString("<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:")
	b.WriteString(emailColorMuted)
	b.WriteString(";\">")
	b.WriteString(escBrand)
	b.WriteString("</div>")
	b.WriteString("<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;line-height:1.25;margin-top:8px;color:")
	b.WriteString(emailColorText)
	b.WriteString(";\">")
	b.WriteString(escTitle)
	b.WriteString("</div>")
	b.WriteString("</div>")

	// Body.
	b.WriteString("<div style=\"padding:20px 24px 22px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:")
	b.WriteString(emailColorText)
	b.WriteString(";\">")
	b.WriteString(bodyHTML)
	b.WriteString("</div>")

	// Action button + fallback link.
	if doc.Action != nil && strings.TrimSpace(doc.Action.URL) != "" {
		label := strings.TrimSpace(doc.Action.Label)
		if label == "" {
			label = "Open"
		}
		escLabel := html.EscapeString(label)
		escURL := html.EscapeString(strings.TrimSpace(doc.Action.URL))

		b.WriteString("<div style=\"padding:0 24px 22px 24px;\">")
		// Bulletproof-ish button.
		b.WriteString("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td align=\"center\" bgcolor=\"")
		b.WriteString(emailColorAccent)
		b.WriteString("\" style=\"border-radius:")
		b.WriteString(fmt.Sprintf("%dpx", emailRadiusPx))
		b.WriteString(";\">")
		b.WriteString("<a href=\"")
		b.WriteString(escURL)
		b.WriteString("\" target=\"_blank\" style=\"display:inline-block;padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;line-height:1;color:")
		b.WriteString(emailColorAccentText)
		b.WriteString(";text-decoration:none;border:1px solid ")
		b.WriteString(emailColorAccent)
		b.WriteString(";border-radius:")
		b.WriteString(fmt.Sprintf("%dpx", emailRadiusPx))
		b.WriteString(";\">")
		b.WriteString(escLabel)
		b.WriteString("</a>")
		b.WriteString("</td></tr></table>")

		// Fallback URL.
		b.WriteString("<div style=\"margin-top:14px;color:")
		b.WriteString(emailColorMuted)
		b.WriteString(";font-size:12px;line-height:18px;\">Button not working? Copy and paste this link:</div>")
		b.WriteString("<div style=\"margin-top:6px;padding:10px 12px;border:1px solid ")
		b.WriteString(emailColorBorder)
		b.WriteString(";background:")
		b.WriteString(emailColorBg)
		b.WriteString(";border-radius:")
		b.WriteString(fmt.Sprintf("%dpx", emailRadiusPx))
		b.WriteString(";font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;word-break:break-all;\">")
		b.WriteString(escURL)
		b.WriteString("</div>")
		b.WriteString("</div>")
	}

	// Footer.
	b.WriteString("<div style=\"padding:16px 24px;border-top:1px solid ")
	b.WriteString(emailColorBorder)
	b.WriteString(";font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:")
	b.WriteString(emailColorMuted)
	b.WriteString(";\">This is an automated message from ")
	b.WriteString(escBrand)
	b.WriteString(".</div>")

	// Close card.
	b.WriteString("</td></tr>")

	// Spacer.
	b.WriteString("<tr><td style=\"height:14px;\"></td></tr>")
	// Small muted footer.
	b.WriteString("<tr><td align=\"center\" style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:")
	b.WriteString(emailColorMuted)
	b.WriteString(";padding:0 8px;\">")
	b.WriteString(escBrand)
	b.WriteString("</td></tr>")

	// Close container + outer wrapper.
	b.WriteString("</table></td></tr></table>")
	b.WriteString("</body></html>")

	return b.String()
}

func wrapEmailContent(subject string, content string) string {
	if isFullHTMLDocument(content) {
		return content
	}
	body := normalizeEmailBodyHTML(content)
	return RenderEmailDocument(EmailDocument{
		Title:       subject,
		PreviewText: previewTextFromContent(subject, content),
		BodyHTML:    body,
	})
}
