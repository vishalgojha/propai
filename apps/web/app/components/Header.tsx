export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="https://www.propai.live" className="logo">PropAI</a>
        <nav className="nav">
          <a href="https://www.propai.live">Listings</a>
          <a href="https://www.propai.live">Explore Mumbai</a>
          <a href="https://github.com/vishalgojha/wabro/releases/latest/download/wabro-release.apk" target="_blank" rel="noopener noreferrer" style={{color: "var(--accent)"}}>Download WaBro</a>
        </nav>
      </div>
    </header>
  );
}
