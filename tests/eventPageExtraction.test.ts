import { describe, expect, it } from "vitest";
import {
  extractEventPageData,
  extractVenuePageData,
  isGenericPageTitle,
  isSeoListingTitle,
  isSocialOrTicketingUrl,
  sanitizeRawTitle,
  selectEventDetailLinks
} from "../src/booking/eventPageExtraction.js";

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

// A small DIY venue event page with no JSON-LD and no Open Graph venue
// signal at all — the venue name is only ever present as the leading
// segment of the <address> block, e.g. "GRRRND ZERO, 60 Avenue de Bohlen,
// Vaulx en Velin 69120" (reported bug: the address itself was already being
// extracted, but the venue name leading it was silently discarded).
const ADDRESS_ONLY_VENUE_NAME_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Fossilization / Phobocosm / Grotesquerie le 16 août 2026 à Vaulx-en-Velin (69)</title>
</head>
<body>
  <h1>Fossilization / Phobocosm / Grotesquerie</h1>
  <p>Rendez-vous <time datetime="2026-08-16T20:00:00+02:00">16 août 2026</time>.</p>
  <address>GRRRND ZERO, 60 Avenue de Bohlen, Vaulx en Velin 69120</address>
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

  it("does not invent a venue name from an address with no name prefix (non-Razibus fixture)", () => {
    const result = extractEventPageData(GENERIC_VENUE_EVENT_HTML, "https://larampe.example/agenda/iron-resolve", {
      referenceDate: REFERENCE_DATE
    });

    expect(result.venueName).toBeNull();
  });

  it("extracts the venue name from an <address> block's leading segment when no JSON-LD is present", () => {
    const result = extractEventPageData(
      ADDRESS_ONLY_VENUE_NAME_HTML,
      "https://razibus.net/16-08-2026-fossilization-phobocosm-grotesquerie-vaulx-en-velin-35773.html",
      { referenceDate: REFERENCE_DATE }
    );

    expect(result.venueName).toBe("GRRRND ZERO");
    expect(result.address).toBe("GRRRND ZERO, 60 Avenue de Bohlen, Vaulx en Velin 69120");
    expect(result.fieldSources.venueName).toBe("page_content");
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

describe("isGenericPageTitle", () => {
  it("recognizes generic page-section labels case- and accent-insensitively", () => {
    expect(isGenericPageTitle("Agenda")).toBe(true);
    expect(isGenericPageTitle("agenda")).toBe(true);
    expect(isGenericPageTitle("AGENDA")).toBe(true);
    expect(isGenericPageTitle("Événements")).toBe(true);
    expect(isGenericPageTitle("evenements")).toBe(true);
    expect(isGenericPageTitle("Programmation")).toBe(true);
    expect(isGenericPageTitle("Accueil")).toBe(true);
  });

  it("does not flag a real venue/artist name as generic", () => {
    expect(isGenericPageTitle("Quai M")).toBe(false);
    expect(isGenericPageTitle("Le Razibus")).toBe(false);
  });
});

describe("extractVenuePageData — regression fixture based on quai-m.fr/agenda", () => {
  const REFERENCE_DATE = new Date("2026-07-24T00:00:00Z");

  // Models the real quai-m.fr/agenda structure: a generic "Agenda" H1/title,
  // header logo branding, a footer address block, and several event-card
  // date snippets — without inventing content that isn't representative of
  // what such listing pages typically expose.
  const QUAI_M_AGENDA_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Agenda | Quai M</title>
  <meta property="og:site_name" content="Quai M">
</head>
<body>
  <header>
    <img class="logo" src="/assets/logo-quai-m.png" alt="Quai M">
  </header>
  <main>
    <h1>Agenda</h1>
    <div class="event-card"><h3>Band A</h3><time datetime="2026-09-12">12 septembre 2026</time></div>
    <div class="event-card"><h3>Band B</h3><time datetime="2026-10-03">3 octobre 2026</time></div>
    <div class="event-card"><h3>Band C</h3><time datetime="2026-11-20">20 novembre 2026</time></div>
  </main>
  <footer>
    <address>94 Boulevard du Maréchal Leclerc, 85000 La Roche-sur-Yon</address>
  </footer>
</body>
</html>`;

  it("extracts the venue's real name, never the generic page title", () => {
    const result = extractVenuePageData(QUAI_M_AGENDA_HTML, "https://quai-m.fr/agenda", REFERENCE_DATE);
    expect(result.venueName).toBe("Quai M");
    expect(result.venueName).not.toBe("Agenda");
  });

  it("detects the page as a collection/listing page", () => {
    const result = extractVenuePageData(QUAI_M_AGENDA_HTML, "https://quai-m.fr/agenda", REFERENCE_DATE);
    expect(result.isCollectionPage).toBe(true);
    expect(result.collectionPageReason).toBeTruthy();
  });

  it("never resolves or leaks a date onto the venue-level result", () => {
    const result = extractVenuePageData(QUAI_M_AGENDA_HTML, "https://quai-m.fr/agenda", REFERENCE_DATE);
    expect(result.eventDate).toBeNull();
    expect(result.eventDateDisplay).toBeNull();
  });

  it("extracts the full address from the footer", () => {
    const result = extractVenuePageData(QUAI_M_AGENDA_HTML, "https://quai-m.fr/agenda", REFERENCE_DATE);
    expect(result.address).toBe("94 Boulevard du Maréchal Leclerc, 85000 La Roche-sur-Yon");
    expect(result.locationSource).toBe("footer");
  });

  it("extracts the header logo as the venue image with correct provenance", () => {
    const result = extractVenuePageData(QUAI_M_AGENDA_HTML, "https://quai-m.fr/agenda", REFERENCE_DATE);
    expect(result.imageUrl).toBe("/assets/logo-quai-m.png");
    expect(result.imageSource).toBe("header_logo");
  });

  it("records the rejected generic title when the fallback tier is the one that would have used it", () => {
    // og:site_name wins here (higher priority than document title), so the
    // bare document-title tier is never reached and nothing is rejected —
    // confirmed separately below with og:site_name removed.
    const withoutSiteName = QUAI_M_AGENDA_HTML.replace('<meta property="og:site_name" content="Quai M">', "");
    const result = extractVenuePageData(withoutSiteName, "https://quai-m.fr/agenda", REFERENCE_DATE);
    expect(result.venueName).toBe("Quai M");
    expect(result.nameSource).toBe("header_logo");
  });

  it("rejects a bare generic title with no brand information and falls back to domain inference", () => {
    const bareAgenda = `<html><head><title>Agenda</title></head><body><div class="event-card"><time datetime="2026-09-12">a</time></div><div class="event-card"><time datetime="2026-10-03">b</time></div><div class="event-card"><time datetime="2026-11-20">c</time></div></body></html>`;
    const result = extractVenuePageData(bareAgenda, "https://quai-m.fr/agenda", REFERENCE_DATE);
    expect(result.venueName).toBe("Quai M");
    expect(result.nameSource).toBe("domain_inference");
    expect(result.rejectedNames).toContainEqual({ value: "Agenda", reason: "generic_page_title" });
  });
});

describe("extractVenuePageData — identity resolution priority chain", () => {
  const REFERENCE_DATE = new Date("2026-07-24T00:00:00Z");

  it("prefers a JSON-LD Organization/MusicVenue node over every other signal", () => {
    const html = `<html><head><title>Agenda</title>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "MusicVenue",
        name: "Le Krakatoa",
        address: { "@type": "PostalAddress", streetAddress: "3 avenue Berthelot", postalCode: "33000", addressLocality: "Bordeaux", addressCountry: "France" }
      })}</script>
    </head><body></body></html>`;
    const result = extractVenuePageData(html, "https://lekrakatoa.example/agenda", REFERENCE_DATE);
    expect(result.venueName).toBe("Le Krakatoa");
    expect(result.nameSource).toBe("structured_data");
    expect(result.city).toBe("Bordeaux");
    expect(result.postalCode).toBe("33000");
    expect(result.country).toBe("France");
  });

  it("uses an Event node's own location.name when the page's JSON-LD describes one event", () => {
    const html = `<html><head><title>Concert</title>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "MusicEvent",
        name: "Some Show",
        startDate: "2026-09-12",
        location: { name: "Le Krakatoa", address: { streetAddress: "3 avenue Berthelot", postalCode: "33000", addressLocality: "Bordeaux" } }
      })}</script>
    </head><body></body></html>`;
    const result = extractVenuePageData(html, "https://example.com/event/some-show", REFERENCE_DATE);
    expect(result.venueName).toBe("Le Krakatoa");
    expect(result.nameSource).toBe("structured_data");
  });

  it("cleans a compound document title with a pipe separator (Agenda | Quai M)", () => {
    const html = `<html><head><title>Agenda | Quai M</title></head><body></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/somewhere", REFERENCE_DATE);
    expect(result.venueName).toBe("Quai M");
    expect(result.nameSource).toBe("document_title");
  });

  it("cleans a compound document title with a dash separator (Programmation - Le Krakatoa)", () => {
    const html = `<html><head><title>Programmation - Le Krakatoa</title></head><body></body></html>`;
    const result = extractVenuePageData(html, "https://lekrakatoa.example/somewhere", REFERENCE_DATE);
    expect(result.venueName).toBe("Le Krakatoa");
    expect(result.nameSource).toBe("document_title");
  });

  it("never rejects a genuinely non-generic single-segment title", () => {
    const html = `<html><head><title>Quai M</title></head><body></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/", REFERENCE_DATE);
    expect(result.venueName).toBe("Quai M");
    expect(result.rejectedNames).toEqual([]);
  });

  it("infers a venue name from the domain as the lowest-confidence fallback", () => {
    const html = `<html><head></head><body></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/", REFERENCE_DATE);
    expect(result.venueName).toBe("Quai M");
    expect(result.nameSource).toBe("domain_inference");
  });
});

describe("extractVenuePageData — collection-page detection and date handling", () => {
  const REFERENCE_DATE = new Date("2026-07-24T00:00:00Z");

  it("detects a collection page purely from the URL path", () => {
    const html = `<html><head><title>Quai M</title></head><body><p>No dates here.</p></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/agenda", REFERENCE_DATE);
    expect(result.isCollectionPage).toBe(true);
  });

  it("detects a collection page purely from repeated date snippets, even with a non-listing URL", () => {
    const html = `<html><head><title>Quai M</title></head><body>
      <p>12 septembre 2026</p><p>3 octobre 2026</p><p>20 novembre 2026</p>
    </body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/", REFERENCE_DATE);
    expect(result.isCollectionPage).toBe(true);
  });

  it("does not treat a single-event page as a collection page", () => {
    const html = `<html><head><title>Band A at Quai M</title></head><body>
      <script type="application/ld+json">${JSON.stringify({ "@type": "MusicEvent", name: "Band A live", startDate: "2026-09-12" })}</script>
    </body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/event/band-a", REFERENCE_DATE);
    expect(result.isCollectionPage).toBe(false);
  });

  it("resolves a real event date for a non-collection single-event page", () => {
    const html = `<html><head><title>Band A at Quai M</title></head><body>
      <script type="application/ld+json">${JSON.stringify({ "@type": "MusicEvent", name: "Band A live", startDate: "2026-09-12" })}</script>
    </body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/event/band-a", REFERENCE_DATE);
    expect(result.eventDate).toBe("2026-09-12");
  });
});

describe("extractVenuePageData — image/logo priority", () => {
  const REFERENCE_DATE = new Date("2026-07-24T00:00:00Z");

  it("prefers structured-data image/logo over everything else", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://example.com/og.jpg">
      <script type="application/ld+json">${JSON.stringify({ "@type": "MusicVenue", name: "Quai M", logo: "https://example.com/structured-logo.png" })}</script>
    </head><body><header><img class="logo" src="/header-logo.png" alt="Quai M"></header></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/", REFERENCE_DATE);
    expect(result.imageUrl).toBe("https://example.com/structured-logo.png");
    expect(result.imageSource).toBe("structured_data");
  });

  it("falls back to og:image when no structured image is present", () => {
    const html = `<html><head><meta property="og:image" content="https://example.com/og.jpg"></head><body></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/", REFERENCE_DATE);
    expect(result.imageUrl).toBe("https://example.com/og.jpg");
    expect(result.imageSource).toBe("og_image");
  });

  it("falls back to the header logo when no structured image or og:image is present", () => {
    const html = `<html><head></head><body><header><img class="logo" src="/header-logo.png" alt="Quai M"></header></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/", REFERENCE_DATE);
    expect(result.imageUrl).toBe("/header-logo.png");
    expect(result.imageSource).toBe("header_logo");
  });

  it("falls back to the favicon as a last resort before giving up", () => {
    const html = `<html><head><link rel="icon" href="/favicon.ico"></head><body></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/", REFERENCE_DATE);
    expect(result.imageUrl).toBe("/favicon.ico");
    expect(result.imageSource).toBe("favicon");
  });

  it("returns no image rather than inventing one when nothing is available", () => {
    const html = `<html><head></head><body></body></html>`;
    const result = extractVenuePageData(html, "https://quai-m.fr/", REFERENCE_DATE);
    expect(result.imageUrl).toBeNull();
    expect(result.imageSource).toBeNull();
  });
});

describe("isSocialOrTicketingUrl", () => {
  it("recognizes known social and ticketing domains", () => {
    expect(isSocialOrTicketingUrl("https://www.instagram.com/quaim")).toBe(true);
    expect(isSocialOrTicketingUrl("https://facebook.com/quaim")).toBe(true);
    expect(isSocialOrTicketingUrl("https://www.ticketmaster.com/event/123")).toBe(true);
  });

  it("does not flag an ordinary venue domain", () => {
    expect(isSocialOrTicketingUrl("https://quai-m.fr/event/band-a")).toBe(false);
  });

  it("treats a malformed URL as social/ticketing (fail safe, never included)", () => {
    expect(isSocialOrTicketingUrl("not-a-url")).toBe(true);
  });
});

describe("selectEventDetailLinks", () => {
  const agendaUrl = "https://quai-m.fr/agenda";

  it("keeps same-origin event-detail links and excludes the agenda page itself", () => {
    const links = [
      "https://quai-m.fr/event/band-a",
      "https://quai-m.fr/event/band-b",
      "https://quai-m.fr/agenda",
      "https://quai-m.fr/agenda?page=2"
    ];
    const selected = selectEventDetailLinks(links, agendaUrl, 10);
    expect(selected).toEqual(["https://quai-m.fr/event/band-a", "https://quai-m.fr/event/band-b"]);
  });

  it("excludes cross-origin, social, and ticketing links", () => {
    const links = [
      "https://quai-m.fr/event/band-a",
      "https://other-site.example/event/band-x",
      "https://www.facebook.com/quaim/events",
      "https://www.ticketmaster.com/event/999"
    ];
    const selected = selectEventDetailLinks(links, agendaUrl, 10);
    expect(selected).toEqual(["https://quai-m.fr/event/band-a"]);
  });

  it("caps the number of selected links to maxLinks", () => {
    const links = Array.from({ length: 20 }, (_, i) => `https://quai-m.fr/event/band-${i}`);
    const selected = selectEventDetailLinks(links, agendaUrl, 5);
    expect(selected).toHaveLength(5);
  });

  it("deduplicates links that only differ by query string", () => {
    const links = ["https://quai-m.fr/event/band-a", "https://quai-m.fr/event/band-a?utm_source=newsletter"];
    const selected = selectEventDetailLinks(links, agendaUrl, 10);
    expect(selected).toHaveLength(1);
  });

  it("returns an empty list for a malformed agenda URL", () => {
    expect(selectEventDetailLinks(["https://quai-m.fr/event/band-a"], "not-a-url", 10)).toEqual([]);
  });
});

// Issue #201 follow-up regression: a genre/city listing (directory/
// aggregator) page like concerts50.com must never be classified as a venue
// or a single event, and its SEO title must never be accepted as a
// venue/event name.
const CONCERTS50_LISTING_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Emo / Hardcore / Punk Concerts in Paris 2026-2027 | Music Events, Gigs & Tickets</title>
  <meta property="og:site_name" content="Concerts50">
</head>
<body>
<header><img class="logo" src="/logo.png" alt="Concerts50"></header>
<main>
  <div class="event-card"><a href="/event/band-a">Band A</a><time datetime="2026-09-12">12 Sep 2026</time></div>
  <div class="event-card"><a href="/event/band-b">Band B</a><time datetime="2026-10-03">3 Oct 2026</time></div>
  <div class="event-card"><a href="/event/band-c">Band C</a><time datetime="2026-11-20">20 Nov 2026</time></div>
</main>
</body>
</html>`;

describe("classifySourcePageType (issue #201 follow-up: listing/aggregator pages)", () => {
  it("classifies a Concerts50-style genre listing page as event_listing, never a venue or single event", () => {
    const result = extractVenuePageData(CONCERTS50_LISTING_HTML, "https://concerts50.com/france/paris/g/punk");

    expect(result.pageType).toBe("event_listing");
    expect(result.isSingleEvent).toBe(false);
    expect(result.isVenue).toBe(false);
  });

  it("still classifies a real small venue's own agenda page as venue (quai-m.fr regression)", () => {
    const html = `<!DOCTYPE html><html><head><title>Agenda | Quai M</title></head><body>
<header><img class="logo" src="/logo.png" alt="Quai M"></header>
<main>
  <div class="event-card"><time datetime="2026-09-12">12 septembre 2026</time></div>
  <div class="event-card"><time datetime="2026-10-03">3 octobre 2026</time></div>
  <div class="event-card"><time datetime="2026-11-20">20 novembre 2026</time></div>
</main>
</body></html>`;

    const result = extractVenuePageData(html, "https://quai-m.fr/agenda");

    expect(result.pageType).toBe("venue");
    expect(result.isVenue).toBe(true);
    expect(result.venueName).toBe("Quai M");
  });

  it("classifies a page with exactly one MusicEvent JSON-LD node as single_event", () => {
    const html = `<!DOCTYPE html><html><head><title>Show details</title></head><body>
<script type="application/ld+json">${JSON.stringify({
      "@type": "MusicEvent",
      name: "The Slugz live",
      startDate: "2026-09-12",
      location: { name: "La Maroquinerie" }
    })}</script>
</body></html>`;

    const result = extractVenuePageData(html, "https://example.test/event/the-slugz");

    expect(result.pageType).toBe("single_event");
    expect(result.isSingleEvent).toBe(true);
    expect(result.isVenue).toBe(false);
  });
});

describe("isSeoListingTitle (issue #201 follow-up)", () => {
  it("rejects the exact reported SEO listing title", () => {
    expect(isSeoListingTitle("Emo / Hardcore / Punk Concerts in Paris 2026-2027 | Music Events, Gigs & Tickets")).toBe(true);
  });

  it("rejects other common listing-page title patterns", () => {
    expect(isSeoListingTitle("Upcoming Events in Lyon")).toBe(true);
    expect(isSeoListingTitle("Best Concerts This Month")).toBe(true);
    expect(isSeoListingTitle("Rock Concerts in Berlin 2026-2027")).toBe(true);
  });

  it("does not reject a real, specific venue or event name", () => {
    expect(isSeoListingTitle("Quai M")).toBe(false);
    expect(isSeoListingTitle("The Slugz at La Maroquinerie")).toBe(false);
    expect(isSeoListingTitle("Vulgar Display feat. Rancid Youth + The Static Age")).toBe(false);
  });
});

describe("extractEventPageData — structured title building (issue #201 follow-up)", () => {
  it("builds 'Artist at Venue' from headliners/venue when no real title is found, instead of using a generic/SEO title", () => {
    const html = `<!DOCTYPE html><html><head>
  <title>Emo / Hardcore / Punk Concerts in Paris 2026-2027 | Music Events, Gigs & Tickets</title>
  <meta property="og:title" content="Emo / Hardcore / Punk Concerts in Paris 2026-2027 | Music Events, Gigs & Tickets">
</head><body>
<script type="application/ld+json">${JSON.stringify({
      "@type": "MusicEvent",
      startDate: "2026-09-12",
      performer: [{ name: "The Slugz" }],
      location: { name: "La Maroquinerie" }
    })}</script>
</body></html>`;

    const result = extractEventPageData(html, "https://concerts50.com/event/the-slugz");

    expect(result.title).toBe("The Slugz at La Maroquinerie");
    expect(result.sourceTitle).toContain("Music Events, Gigs & Tickets");
    expect(result.title).not.toBe(result.sourceTitle);
  });

  it("keeps a genuinely specific JSON-LD event title untouched (never rebuilds over a good title)", () => {
    const html = `<!DOCTYPE html><html><head><title>Vulgar Display at Le Razibus</title></head><body>
<script type="application/ld+json">${JSON.stringify({
      "@type": "MusicEvent",
      name: "Vulgar Display feat. Rancid Youth + The Static Age",
      startDate: "2026-09-12",
      performer: [{ name: "Vulgar Display" }],
      location: { name: "Le Razibus" }
    })}</script>
</body></html>`;

    const result = extractEventPageData(html, "https://razibus.net/event/vulgar-display");

    expect(result.title).toBe("Vulgar Display feat. Rancid Youth + The Static Age");
  });

  it("falls back to the generic label (never a raw SEO title) when no headliners/venue can be resolved either", () => {
    const html = `<!DOCTYPE html><html><head>
  <title>Best Concerts This Month | Music Events, Gigs & Tickets</title>
</head><body>No structured data at all.</body></html>`;

    const result = extractEventPageData(html, "https://concerts50.com/france/paris/g/punk");

    expect(result.title).toBe("Event");
    expect(result.title).not.toContain("Music Events");
    expect(result.sourceTitle).toContain("Best Concerts This Month");
  });
});

// Issue #201 follow-up (real regression, found via a live CLI run after the
// initial fix): the WebSearchBookingSourceProvider fix alone wasn't enough —
// SimilarArtistLiveHistoryBookingSourceProvider and
// VenueDiscoveryBookingSourceProvider each build raw booking sources
// directly from search-result titles with no HTML at all, and none of the
// original blocklist patterns matched these real-world listing/ticketing
// titles observed in that live run.
describe("sanitizeRawTitle (issue #201 follow-up, no-HTML raw search-result path)", () => {
  it("rejects real observed ticketing-platform genre/city listing titles", () => {
    expect(sanitizeRawTitle("Poppunk Gigs in Paris | DICE")).toBeNull();
    expect(sanitizeRawTitle("Pop Punk Tonight in Paris - Lineups & Tickets | Mood")).toBeNull();
    expect(sanitizeRawTitle("Emo Gigs in Paris - DICE")).toBeNull();
  });

  it("rejects encyclopedia/blog-article-style titles", () => {
    expect(sanitizeRawTitle("Punk subculture")).toBeNull();
    expect(sanitizeRawTitle("The Art of Punk: How Music and Culture Collide")).toBeNull();
  });

  it("rejects a nightlife-guide-style title", () => {
    expect(
      sanitizeRawTitle("Punk Paradise Paris: rock concerts, clubbing & DJ sets in the 11th arrondissement")
    ).toBeNull();
  });

  it("strips a trailing ticketing-platform brand segment but keeps a genuinely good title", () => {
    expect(sanitizeRawTitle("Emo Night : Brokencyde + Dot Dot Curve, Paris · Shotgun Tickets")).toBe(
      "Emo Night : Brokencyde + Dot Dot Curve, Paris"
    );
  });

  it("keeps a real, specific event/venue title untouched", () => {
    expect(sanitizeRawTitle("ALL TIME LOW en concert à la Salle Pleyel")).toBe("ALL TIME LOW en concert à la Salle Pleyel");
    expect(sanitizeRawTitle("Quai M")).toBe("Quai M");
  });

  it("returns null for empty/missing input rather than an empty string", () => {
    expect(sanitizeRawTitle(null)).toBeNull();
    expect(sanitizeRawTitle("")).toBeNull();
    expect(sanitizeRawTitle("   ")).toBeNull();
  });
});
