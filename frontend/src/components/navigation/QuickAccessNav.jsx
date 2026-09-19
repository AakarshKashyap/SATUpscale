import { useState } from "react";
import { Compass, ChevronUp } from "lucide-react";

export default function QuickAccessNav() {
  const [expanded, setExpanded] = useState(false);

  const navLinks = [
    { label: "ABOUT", href: "#home" },
    { label: "PLATFORM", href: "#home" },
    { label: "IMAGERY", href: "#imagery-showcase" },
    { label: "ENHANCEMENT", href: "#enhancement" },
    { label: "INTELLIGENCE", href: "#technology" },
    { label: "CONTACT", href: "#target-selection" },
  ];

  const handleLinkClick = (e, href) => {
    e.preventDefault();
    setExpanded(false);
    const targetElement = document.querySelector(href);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <aside className="quick-access-nav-wrapper">
      {/* DESKTOP FLOATING GLASS QUICK ACCESS PILL */}
      <div className={`quick-access-desktop-pill ${expanded ? "expanded" : ""}`}>
        <button
          className="quick-access-trigger-btn"
          onClick={() => setExpanded(!expanded)}
          aria-label="Toggle Quick Access Navigation"
          data-cursor="NAVIGATE"
        >
          <Compass className="icon-sm violet" />
          <span>QUICK ACCESS</span>
          <ChevronUp className={`icon-xs transition-arrow ${expanded ? "rotate-180" : ""}`} />
        </button>

        {expanded && (
          <div className="quick-access-menu-panel">
            {navLinks.map((link, idx) => (
              <a
                key={idx}
                href={link.href}
                className="quick-access-item"
                onClick={(e) => handleLinkClick(e, link.href)}
              >
                <span>{link.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
