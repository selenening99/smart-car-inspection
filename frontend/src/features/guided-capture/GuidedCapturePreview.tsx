import { useState, type JSX } from 'react';
import CapturePage from './pages/CapturePage';
import HomePage from './pages/HomePage';
import ReviewPage from './pages/ReviewPage';
import './styles/GuidedCapturePreview.css';

type PreviewPage = 'home' | 'capture' | 'review';

const previewPages: readonly { id: PreviewPage; label: string }[] = [
  {
    id: 'home',
    label: '首頁',
  },
  {
    id: 'capture',
    label: '拍攝',
  },
  {
    id: 'review',
    label: '確認',
  },
];

function getInitialPreviewPage(): PreviewPage {
  const pageFromHash = window.location.hash.replace('#', '');

  if (pageFromHash === 'capture' || pageFromHash === 'review') {
    return pageFromHash;
  }

  return 'home';
}

function renderPreviewPage(page: PreviewPage): JSX.Element {
  if (page === 'capture') {
    return <CapturePage previewMode />;
  }

  if (page === 'review') {
    return <ReviewPage />;
  }

  return <HomePage />;
}

export default function GuidedCapturePreview(): JSX.Element {
  const [page, setPage] = useState<PreviewPage>(getInitialPreviewPage);

  function selectPreviewPage(nextPage: PreviewPage): void {
    window.location.hash = nextPage === 'home' ? '' : nextPage;
    setPage(nextPage);
  }

  return (
    <main className="guided-capture-preview">
      <nav aria-label="拍攝流程預覽頁面" className="guided-capture-preview__nav">
        {previewPages.map((previewPage) => {
          const selected = page === previewPage.id;

          return (
            <button
              aria-pressed={selected}
              className={`guided-capture-preview__button${selected ? ' guided-capture-preview__button--selected' : ''}`}
              key={previewPage.id}
              onClick={() => selectPreviewPage(previewPage.id)}
              type="button"
            >
              {previewPage.label}
            </button>
          );
        })}
      </nav>

      <div className="guided-capture-preview__page">
        {renderPreviewPage(page)}
      </div>
    </main>
  );
}
