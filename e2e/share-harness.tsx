// Renders the REAL ShareGroupDialog (with the REAL AuthProvider, CSS and
// component code) so Playwright can measure the actual layout in a browser.
// The Gateway network calls are intercepted by the spec, so no backend is
// needed — only the transport is faked; the component and its styles are real.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '../src/hooks/useAuth';
import ShareGroupDialog from '../src/components/groups/ShareGroupDialog';
import { Toaster } from '../src/components/ui/toaster';
import '../src/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <ShareGroupDialog
      isOpen
      groupId="group-layout-test"
      groupName="Layout Test Group"
      onClose={() => {}}
    />
    <Toaster />
  </AuthProvider>
);
