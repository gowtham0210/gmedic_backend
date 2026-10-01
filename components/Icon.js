// Matches the `icon()` helper the EJS views used — same sprite, same markup,
// so public/css/app.css's `.icon` rules apply unchanged.
export default function Icon({ name, className = '' }) {
  return (
    <svg className={`icon${className ? ` ${className}` : ''}`} aria-hidden="true" focusable="false">
      <use href={`/images/icons.svg#${name}`} />
    </svg>
  );
}
