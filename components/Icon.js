import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import iconMap from '../lib/iconMap';

// Renders a Font Awesome icon by the portal's icon name (see lib/iconMap.js).
// The `icon` class keeps public/css/app.css's sizing rules (.icon, .icon--sm …)
// working exactly as they did with the old SVG sprite.
export default function Icon({ name, className = '' }) {
  const icon = iconMap[name];
  if (!icon && process.env.NODE_ENV !== 'production') {
    console.warn(`<Icon>: no Font Awesome mapping for "${name}" — add it to lib/iconMap.js`);
  }
  return (
    <FontAwesomeIcon
      icon={icon || faCircleQuestion}
      className={`icon${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      focusable="false"
    />
  );
}
