import met_36493 from '../assets/covers/met-36493.jpg';
import met_436535 from '../assets/covers/met-436535.jpg';
import met_10497 from '../assets/covers/met-10497.jpg';
import met_10786 from '../assets/covers/met-10786.jpg';
import met_437853 from '../assets/covers/met-437853.jpg';
import met_36497 from '../assets/covers/met-36497.jpg';
import met_36504 from '../assets/covers/met-36504.jpg';
import met_36965 from '../assets/covers/met-36965.jpg';
import met_39798 from '../assets/covers/met-39798.jpg';
import met_39800 from '../assets/covers/met-39800.jpg';
import met_45434 from '../assets/covers/met-45434.jpg';
import met_54868 from '../assets/covers/met-54868.jpg';
import met_55049 from '../assets/covers/met-55049.jpg';
import met_56242 from '../assets/covers/met-56242.jpg';
import met_56395 from '../assets/covers/met-56395.jpg';
import met_57003 from '../assets/covers/met-57003.jpg';

/**
 * The bundled picture for each print in the Met gallery.
 *
 * These are the covers themselves, not previews: the picker paints one in the
 * grid and copies the same file into the workspace when it is chosen. Shipping
 * them means the window never loads a remote address and the gallery works with
 * no connection.
 *
 * Regenerate the files with `node scripts/build-met-covers.mjs`.
 */
export const MET_COVER_IMAGES: Readonly<Record<string, string>> = {
  'met-436535': met_436535,
  'met-10497': met_10497,
  'met-10786': met_10786,
  'met-437853': met_437853,
  'met-36493': met_36493,
  'met-36497': met_36497,
  'met-36504': met_36504,
  'met-36965': met_36965,
  'met-39798': met_39798,
  'met-39800': met_39800,
  'met-45434': met_45434,
  'met-54868': met_54868,
  'met-55049': met_55049,
  'met-56242': met_56242,
  'met-56395': met_56395,
  'met-57003': met_57003,
};
