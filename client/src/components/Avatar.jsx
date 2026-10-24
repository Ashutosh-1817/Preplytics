// A user's picture, or their initial on a coloured tile when they have none.
function Avatar({ user, size = 36, className = '' }) {
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className={`avatar avatar-img ${className}`} style={style} referrerPolicy="no-referrer" />;
  }
  return <div className={`avatar ${className}`} style={style} aria-hidden="true">{initial}</div>;
}

export default Avatar;