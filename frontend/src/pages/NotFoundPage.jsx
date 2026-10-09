import { Link } from 'react-router-dom';
import { Empty } from '../components/ui.jsx';

export default function NotFoundPage() {
  return (
    <Empty title="Page not found">
      <Link to="/">Go to the start page</Link>
    </Empty>
  );
}
