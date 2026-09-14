import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-600.css';
import {createRoot} from 'react-dom/client';
import Home from '../app/page';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<Home/>);

