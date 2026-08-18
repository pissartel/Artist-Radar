export function buildSimilarArtistOrganizationQueries(artistName: string): string[] {
  return [
    `"${artistName}" music association collective`,
    `"${artistName}" residency showcase organizer`
  ];
}

export function buildEventOrganizerQueries(genre: string, location: string): string[] {
  return [`${genre} concert organizer association ${location}`, `${genre} showcase collective ${location}`];
}

export function buildLocalResourceQueries(genre: string, location: string): string[] {
  return [`music association directory ${location} ${genre}`, `regional music artist support ${location}`];
}

export function buildSupportProgramQueries(location: string): string[] {
  return [`emerging artist residency grant program ${location}`, `music artist support membership application ${location}`];
}

export function buildGenreCollectiveQueries(genre: string, location: string): string[] {
  return [`${genre} artist collective ${location}`, `${genre} music nonprofit ${location}`];
}
