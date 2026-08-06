import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8");
}

describe("BookingOpportunityCard content", () => {
  const source = readSource("src/components/dashboard/BookingOpportunityCard.tsx");

  it("does not render genre chips as venue facts", () => {
    const venueSection = source.slice(source.indexOf("function VenueCardMeta"), source.indexOf("function OrganizationCardMeta"));

    expect(venueSection).toContain("Contact available");
    expect(venueSection).not.toContain("opportunity.genres");
  });

  it("keeps genre chips for organization cards", () => {
    const organizationSection = source.slice(source.indexOf("function OrganizationCardMeta"), source.indexOf("interface BookingOpportunityCardProps"));

    expect(organizationSection).toContain("opportunity.genres");
  });
});
