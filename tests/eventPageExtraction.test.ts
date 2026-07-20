import { describe, expect, it } from "vitest";
import { extractEventPageData } from "../src/booking/eventPageExtraction.js";

const REFERENCE_DATE = new Date("2026-07-05T00:00:00Z");

// Razibus (razibus.net) publishes individual event pages with JSON-LD MusicEvent
// markup alongside an HTML fallback. This mirrors that structure closely enough
// to exercise the JSON-LD tier end-to-end.
const RAZIBUS_EVENT_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Punk concert</title>
  <meta name="description" content="Generic agenda listing page.">
  <meta property="og:title" content="Punk concert">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    "name": "Vulgar Display feat. Rancid Youth + The Static Age",
    "description": "Soirée punk rock au Razibus avec trois groupes en tournée européenne.",
    "startDate": "2026-09-12T20:30:00+02:00",
    "doorTime": "2026-09-12T19:30:00+02:00",
    "location": {
      "@type": "Place",
      "name": "Le Razibus",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "12 rue des Anarchistes",
        "postalCode": "31000",
        "addressLocality": "Toulouse"
      }
    },
    "performer": [
      { "@type": "MusicGroup", "name": "Vulgar Display" },
      { "@type": "MusicGroup", "name": "Rancid Youth" },
      { "@type": "MusicGroup", "name": "The Static Age" }
    ],
    "organizer": {
      "@type": "Organization",
      "name": "Association Razibus",
      "email": "booking@razibus.net"
    },
    "image": "https://razibus.net/img/affiches/vulgar-display.jpg",
    "offers": {
      "@type": "Offer",
      "url": "https://razibus.net/billetterie/vulgar-display"
    }
  }
  </script>
</head>
<body>
  <h1>Punk concert</h1>
  <p>Retrouvez-nous le 12 septembre pour une soirée punk rock.</p>
  <a href="mailto:contact@razibus.net">Nous écrire</a>
  <a href="/contact">Formulaire de contact</a>
</body>
</html>
`;

// A non-Razibus venue site with no JSON-LD at all: Open Graph tags plus
// semantic HTML (<time>, <address>, ticket/contact links) is all it has.
const GENERIC_VENUE_EVENT_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>La Rampe - Agenda</title>
  <meta name="description" content="La Rampe accueille des concerts toute l'année.">
  <meta property="og:title" content="Soirée Hardcore: Iron Resolve + Concrete Youth">
  <meta property="og:description" content="Deux groupes hardcore en co-plateau à La Rampe.">
  <meta property="og:image" content="https://larampe.example/img/affiche-iron-resolve.jpg">
</head>
<body>
  <h1>Soirée Hardcore: Iron Resolve + Concrete Youth</h1>
  <p>Rendez-vous <time datetime="2026-10-03T19:00:00+02:00">vendredi 3 octobre</time>, portes à 19h.</p>
  <address>5 avenue des Musiques, 69003 Lyon</address>
  <a href="https://larampe.example/billetterie">Acheter un billet</a>
  <a href="https://larampe.example/contact">Contact / booking</a>
</body>
</html>
`;

describe("extractEventPageData", () => {
  it("preserves the specific JSON-LD title instead of the generic agenda title (Razibus fixture)", () => {
    const result = extractEventPageData(RAZIBUS_EVENT_HTML, "https://razibus.net/evenements/vulgar-display", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.title).toBe("Vulgar Display feat. Rancid Youth + The Static Age");
    expect(result.fieldSources.title).toBe("structured_metadata");
  });

  it("normalizes the event date without losing the original display value (Razibus fixture)", () => {
    const result = extractEventPageData(RAZIBUS_EVENT_HTML, "https://razibus.net/evenements/vulgar-display", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.eventDate).toBe("2026-09-12");
    expect(result.eventDateDisplay).toBe("2026-09-12T20:30:00+02:00");
    expect(result.doorsTime).toBe("2026-09-12T19:30:00+02:00");
  });

  it("extracts performing artists into headliners and lineup (Razibus fixture)", () => {
    const result = extractEventPageData(RAZIBUS_EVENT_HTML, "https://razibus.net/evenements/vulgar-display", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.headliners).toEqual(["Vulgar Display"]);
    expect(result.lineup).toEqual(["Vulgar Display", "Rancid Youth", "The Static Age"]);
  });

  it("extracts venue name, city and address separately (Razibus fixture)", () => {
    const result = extractEventPageData(RAZIBUS_EVENT_HTML, "https://razibus.net/evenements/vulgar-display", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.venueName).toBe("Le Razibus");
    expect(result.city).toBe("Toulouse");
    expect(result.address).toBe("12 rue des Anarchistes, 31000, Toulouse");
  });

  it("extracts poster and ticket URLs from JSON-LD (Razibus fixture)", () => {
    const result = extractEventPageData(RAZIBUS_EVENT_HTML, "https://razibus.net/evenements/vulgar-display", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.posterImageUrl).toBe("https://razibus.net/img/affiches/vulgar-display.jpg");
    expect(result.ticketUrl).toBe("https://razibus.net/billetterie/vulgar-display");
  });

  it("only stores contact details found in a verifiable source (Razibus fixture)", () => {
    const result = extractEventPageData(RAZIBUS_EVENT_HTML, "https://razibus.net/evenements/vulgar-display", {
      referenceDate: REFERENCE_DATE
    });

    // JSON-LD organizer.email wins over the mailto: link found in semantic HTML.
    expect(result.contactEmail).toBe("booking@razibus.net");
    expect(result.organizerName).toBe("Association Razibus");
  });

  it("falls back to Open Graph and semantic HTML when no JSON-LD is present (non-Razibus fixture)", () => {
    const result = extractEventPageData(GENERIC_VENUE_EVENT_HTML, "https://larampe.example/agenda/iron-resolve", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.title).toBe("Soirée Hardcore: Iron Resolve + Concrete Youth");
    expect(result.fieldSources.title).toBe("structured_metadata");
    expect(result.description).toBe("Deux groupes hardcore en co-plateau à La Rampe.");
    expect(result.posterImageUrl).toBe("https://larampe.example/img/affiche-iron-resolve.jpg");
  });

  it("normalizes a <time datetime> value while keeping the raw display value (non-Razibus fixture)", () => {
    const result = extractEventPageData(GENERIC_VENUE_EVENT_HTML, "https://larampe.example/agenda/iron-resolve", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.eventDate).toBe("2026-10-03");
    expect(result.eventDateDisplay).toBe("2026-10-03T19:00:00+02:00");
    expect(result.fieldSources.eventDate).toBe("page_content");
  });

  it("extracts address from semantic HTML and ticket/contact links (non-Razibus fixture)", () => {
    const result = extractEventPageData(GENERIC_VENUE_EVENT_HTML, "https://larampe.example/agenda/iron-resolve", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.address).toBe("5 avenue des Musiques, 69003 Lyon");
    expect(result.ticketUrl).toBe("https://larampe.example/billetterie");
    expect(result.contactFormUrl).toBe("https://larampe.example/contact");
    expect(result.contactEmail).toBeNull();
  });

  it("generates a generic title only when no usable title exists anywhere", () => {
    const html = `<html><head></head><body><p>Some unrelated boilerplate text with no title.</p></body></html>`;
    const result = extractEventPageData(html, "https://example.com/mystery-event", { referenceDate: REFERENCE_DATE });

    expect(result.title).toBe("Event");
    expect(result.fieldSources.title).toBe("generic_fallback");
  });

  it("uses a caller-supplied fallback label for the generic title when provided", () => {
    const html = `<html><head></head><body><p>No usable title here.</p></body></html>`;
    const result = extractEventPageData(html, "https://example.com/mystery-event", {
      referenceDate: REFERENCE_DATE,
      genericTitleFallbackLabel: "Concert"
    });

    expect(result.title).toBe("Concert");
  });

  it("returns partial data instead of throwing when JSON-LD is malformed", () => {
    const html = `
      <html>
      <head>
        <title>Broken Page</title>
        <script type="application/ld+json">{ not valid json </script>
      </head>
      <body><p>Some fallback content.</p></body>
      </html>
    `;

    expect(() => extractEventPageData(html, "https://example.com/broken", { referenceDate: REFERENCE_DATE })).not.toThrow();
    const result = extractEventPageData(html, "https://example.com/broken", { referenceDate: REFERENCE_DATE });
    expect(result.title).toBe("Broken Page");
  });

  it("returns partial data instead of throwing on completely empty HTML", () => {
    const result = extractEventPageData("", "https://example.com/empty", { referenceDate: REFERENCE_DATE });

    expect(result.title).toBe("Event");
    expect(result.eventDate).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("retains the source URL and an overall confidence score", () => {
    const result = extractEventPageData(RAZIBUS_EVENT_HTML, "https://razibus.net/evenements/vulgar-display", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.sourceUrl).toBe("https://razibus.net/evenements/vulgar-display");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("falls back to verified enrichment data when the page has nothing for a field", () => {
    const html = `<html><head><title>Some Show</title></head><body><p>No venue info here.</p></body></html>`;
    const result = extractEventPageData(html, "https://example.com/some-show", {
      referenceDate: REFERENCE_DATE,
      enrichment: { venueName: "Confirmed Venue Name" }
    });

    expect(result.venueName).toBe("Confirmed Venue Name");
    expect(result.fieldSources.venueName).toBe("verified_enrichment");
  });
});
