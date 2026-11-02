import { initials } from '../lib/initials';

// A doctor's picture: their uploaded photo when they have one, otherwise their initials. Used
// wherever a doctor is shown, so a new photo appears everywhere at once.
export default function DoctorAvatar({ name, photoUrl, size = '', tone = 'teal', ...rest }) {
  const cls = `avatar${tone ? ` avatar--${tone}` : ''}${size ? ` avatar--${size}` : ''}`;
  if (photoUrl) return <img className={cls} src={photoUrl} alt={name || ''} {...rest} />;
  return <span className={cls} {...rest}>{initials(name)}</span>;
}
