import { Card } from '@/components/ui/heroui';

export function SetupPage() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Service not initialized</Card.Title>
        <Card.Description>
          Service is not initialized. Please contact the administrator.
        </Card.Description>
      </Card.Header>
    </Card>
  );
}
