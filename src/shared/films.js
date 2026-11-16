// Which films are in public/films, read from films.json, so the gallery only asks for files that exist.
// The repo ships with none: every wall shows its "Your film here" frame and the trailer button opens the hall.
export const filmUrl = (name) => import.meta.env.BASE_URL + 'films/' + name;

export const films = fetch(filmUrl('films.json'))
  .then((r) => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then((j) => ({ rooms: Array.isArray(j.rooms) ? j.rooms.map(String) : [], trailer: !!j.trailer }));
