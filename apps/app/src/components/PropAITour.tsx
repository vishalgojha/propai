import React from 'react';

type TourDriver = {
  drive: () => void;
  destroy: () => void;
};

type TourStep = {
  element?: string;
  popover: {
    title: string;
    description: string;
    side?: 'left' | 'right' | 'top' | 'bottom';
    align?: 'start' | 'center' | 'end';
  };
};

declare global {
  interface Window {
    __propai_start_tour?: () => void;
  }
}

const TOUR_STEPS: TourStep[] = [
  {
    popover: {
      title: 'Welcome to PropAI Pulse',
      description: 'Quick tour of the working areas. Use it once, then get back to data.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-nav-stream',
    popover: {
      title: 'Stream',
      description: 'Live feed of parsed items. Filter by channel, locality, type, or keyword.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-nav-inbox',
    popover: {
      title: 'Inbox',
      description: 'Matched listings and requirements. Review the best fits first.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-nav-whatsapp',
    popover: {
      title: 'WhatsApp',
      description: 'Connect or reset WhatsApp here. Keep one live session per number.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-nav-broker-network',
    popover: {
      title: 'Broker Network',
      description: 'Contacts and shared groups, kept with the areas and asset types that matter.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-nav-settings',
    popover: {
      title: 'Settings',
      description: 'Set workspace details, API keys, defaults, and replay this tour if needed.',
      side: 'right',
      align: 'start',
    },
  },
  {
    popover: {
      title: 'You are all set',
      description: 'Connect WhatsApp Business, then work from Stream, Inbox, and Pulse.',
      side: 'bottom',
      align: 'center',
    },
  },
];

function injectTourStyles() {
  const id = 'propai-tour-styles';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .driver-active .driver-overlay,.driver-active *{pointer-events:none}
    .driver-active .driver-active-element,.driver-active .driver-active-element *,.driver-popover,.driver-popover *{pointer-events:auto}
    @keyframes animate-fade-in{0%{opacity:0}to{opacity:1}}
    .driver-fade .driver-overlay{animation:animate-fade-in .2s ease-in-out}
    .driver-fade .driver-popover{animation:animate-fade-in .2s}
    .driver-popover{all:unset;box-sizing:border-box;color:#2d2d2d;margin:0;padding:15px;border-radius:5px;min-width:250px;max-width:300px;box-shadow:0 1px 10px #0006;z-index:1000000000;position:fixed;top:0;right:0;background-color:#fff}
    .driver-popover *{font-family:Helvetica Neue,Inter,ui-sans-serif,Helvetica,Arial,sans-serif}
    .driver-popover-title{font:19px/normal sans-serif;font-weight:700;display:block;position:relative;line-height:1.5;zoom:1;margin:0}
    .driver-popover-close-btn{all:unset;position:absolute;top:0;right:0;width:32px;height:28px;cursor:pointer;font-size:18px;font-weight:500;color:#d2d2d2;z-index:1;text-align:center;transition:color;transition-duration:.2s}
    .driver-popover-close-btn:hover,.driver-popover-close-btn:focus{color:#2d2d2d}
    .driver-popover-title[style*=block]+.driver-popover-description{margin-top:5px}
    .driver-popover-description{margin-bottom:0;font:14px/normal sans-serif;line-height:1.5;font-weight:400;zoom:1}
    .driver-popover-footer{margin-top:15px;text-align:right;zoom:1;display:flex;align-items:center;justify-content:space-between}
    .driver-popover-progress-text{font-size:13px;font-weight:400;color:#727272;zoom:1}
    .driver-popover-footer button{all:unset;display:inline-block;box-sizing:border-box;padding:3px 7px;text-decoration:none;text-shadow:1px 1px 0 #fff;background-color:#fff;color:#2d2d2d;font:12px/normal sans-serif;cursor:pointer;outline:0;zoom:1;line-height:1.3;border:1px solid #ccc;border-radius:3px}
    .driver-popover-footer .driver-popover-btn-disabled{opacity:.5;pointer-events:none}
    :not(body):has(>.driver-active-element){overflow:hidden!important}
    .driver-no-interaction,.driver-no-interaction *{pointer-events:none!important}
    .driver-popover-footer button:hover,.driver-popover-footer button:focus{background-color:#f7f7f7}
    .driver-popover-navigation-btns{display:flex;flex-grow:1;justify-content:flex-end}
    .driver-popover-navigation-btns button+button{margin-left:4px}
    .driver-popover-arrow{content:"";position:absolute;border:5px solid #fff}
    .driver-popover-arrow-side-over{display:none}
    .driver-popover-arrow-side-left{left:100%;border-right-color:transparent;border-bottom-color:transparent;border-top-color:transparent}
    .driver-popover-arrow-side-right{right:100%;border-left-color:transparent;border-bottom-color:transparent;border-top-color:transparent}
    .driver-popover-arrow-side-top{top:100%;border-right-color:transparent;border-bottom-color:transparent;border-left-color:transparent}
    .driver-popover-arrow-side-bottom{bottom:100%;border-left-color:transparent;border-top-color:transparent;border-right-color:transparent}
    .driver-popover-arrow-side-center{display:none}
    .driver-popover-arrow-side-left.driver-popover-arrow-align-start,.driver-popover-arrow-side-right.driver-popover-arrow-align-start{top:15px}
    .driver-popover-arrow-side-top.driver-popover-arrow-align-start,.driver-popover-arrow-side-bottom.driver-popover-arrow-align-start{left:15px}
    .driver-popover-arrow-align-end.driver-popover-arrow-side-left,.driver-popover-arrow-align-end.driver-popover-arrow-side-right{bottom:15px}
    .driver-popover-arrow-side-top.driver-popover-arrow-align-end,.driver-popover-arrow-side-bottom.driver-popover-arrow-align-end{right:15px}
    .driver-popover-arrow-side-left.driver-popover-arrow-align-center,.driver-popover-arrow-side-right.driver-popover-arrow-align-center{top:50%;margin-top:-5px}
    .driver-popover-arrow-side-top.driver-popover-arrow-align-center,.driver-popover-arrow-side-bottom.driver-popover-arrow-align-center{left:50%;margin-left:-5px}
    .driver-popover-arrow-none{display:none}

    .driver-overlay { opacity: 0.75 !important; }
    .driver-popover {
      background: #0d1117 !important;
      border: 0.5px solid rgba(62, 232, 138, 0.25) !important;
      border-radius: 18px !important;
      box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(62,232,138,0.06) !important;
      color: #e6edf3 !important;
      max-width: 340px !important;
      min-width: 280px !important;
      padding: 20px 22px 16px !important;
    }
    .driver-popover-title {
      color: #e6edf3 !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      line-height: 1.3 !important;
      margin-bottom: 8px !important;
    }
    .driver-popover-description {
      color: #8b949e !important;
      font-size: 12.5px !important;
      line-height: 1.65 !important;
    }
    .driver-popover-footer {
      align-items: center !important;
      border-top: 0.5px solid rgba(255,255,255,0.06) !important;
      display: flex !important;
      justify-content: space-between !important;
      margin-top: 16px !important;
      padding-top: 12px !important;
    }
    .driver-popover-progress-text {
      color: #3ee88a !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
    }
    .driver-popover-prev-btn,
    .driver-popover-next-btn,
    .driver-popover-close-btn {
      border-radius: 999px !important;
      cursor: pointer !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.06em !important;
      padding: 6px 14px !important;
      text-transform: uppercase !important;
      transition: all 0.15s ease !important;
    }
    .driver-popover-prev-btn {
      background: transparent !important;
      border: 0.5px solid rgba(255,255,255,0.12) !important;
      color: #8b949e !important;
    }
    .driver-popover-prev-btn:hover {
      border-color: rgba(255,255,255,0.25) !important;
      color: #e6edf3 !important;
    }
    .driver-popover-next-btn {
      background: #3ee88a !important;
      border: none !important;
      color: #020f07 !important;
    }
    .driver-popover-next-btn:hover { filter: brightness(0.92) !important; }
    .driver-popover-close-btn {
      background: transparent !important;
      border: none !important;
      color: #8b949e !important;
      font-size: 16px !important;
      padding: 2px 6px !important;
    }
    .driver-popover-close-btn:hover { color: #e6edf3 !important; }
    .driver-highlighted-element {
      outline: 2px solid rgba(62, 232, 138, 0.5) !important;
      outline-offset: 3px !important;
    }
    .driver-popover-arrow-side-right .driver-popover-arrow { border-right-color: #0d1117 !important; }
    .driver-popover-arrow-side-left .driver-popover-arrow { border-left-color: #0d1117 !important; }
    .driver-popover-arrow-side-top .driver-popover-arrow { border-top-color: #0d1117 !important; }
    .driver-popover-arrow-side-bottom .driver-popover-arrow { border-bottom-color: #0d1117 !important; }
  `;
  document.head.appendChild(style);
}

type PropAITourProps = {
  autoStart?: boolean;
  onComplete?: () => void;
};

export const PropAITour: React.FC<PropAITourProps> = ({ autoStart = false, onComplete }) => {
  const driverRef = React.useRef<TourDriver | null>(null);

  const startTour = React.useCallback(async () => {
    const { driver } = await import('driver.js');
    injectTourStyles();

    driverRef.current?.destroy();
    driverRef.current = driver({
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayOpacity: 0.75,
      stagePadding: 6,
      stageRadius: 10,
      showProgress: true,
      progressText: '{{current}} / {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      steps: TOUR_STEPS,
      onDestroyed: () => {
        onComplete?.();
      },
    }) as TourDriver;

    driverRef.current.drive();
  }, [onComplete]);

  React.useEffect(() => {
    window.__propai_start_tour = startTour;
    return () => {
      delete window.__propai_start_tour;
      driverRef.current?.destroy();
    };
  }, [startTour]);

  React.useEffect(() => {
    if (!autoStart) return;
    const timeout = window.setTimeout(() => {
      void startTour();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [autoStart, startTour]);

  return null;
};
