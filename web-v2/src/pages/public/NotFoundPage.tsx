import { useNavigate } from 'react-router-dom';
import { Button, Card } from '@/components/ui/heroui';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Card>
      <Card.Header>
        <Card.Title>Not Found</Card.Title>
        <Card.Description>The page does not exist.</Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button onPress={() => navigate('/')}>Go Home</Button>
      </Card.Footer>
    </Card>
  );
}
