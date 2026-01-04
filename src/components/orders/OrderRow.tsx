import { memo } from 'react';
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Printer, RefreshCw, Eye, Trash2 } from "lucide-react";

interface OrderRowProps {
  order: {
    id: string;
    order_date: string;
    customer_name?: string | null;
    salons?: { name: string } | null;
    total: number;
    status: string;
  };
  isSelected: boolean;
  onSelect: (orderId: string) => void;
  onView: (order: any) => void;
  onStatusChange: (orderId: string, status: string) => void;
  onDelete: (orderId: string) => void;
  onPrint: (order: any) => void;
  onQuickReorder: (order: any) => void;
  getStatusBadge: (status: string) => React.ReactNode;
}

const OrderRowComponent = ({
  order,
  isSelected,
  onSelect,
  onView,
  onStatusChange,
  onDelete,
  onPrint,
  onQuickReorder,
  getStatusBadge,
}: OrderRowProps) => {
  return (
    <TableRow 
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => onView(order)}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(order.id)}
        />
      </TableCell>
      <TableCell className="font-medium">
        {new Date(order.order_date).toLocaleDateString()}
      </TableCell>
      <TableCell>
        {order.salons?.name || order.customer_name || "N/A"}
      </TableCell>
      <TableCell className="text-right font-medium">
        ${order.total.toFixed(2)}
      </TableCell>
      <TableCell>{getStatusBadge(order.status)}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(order)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPrint(order)}>
              <Printer className="mr-2 h-4 w-4" />
              Print Packing Slip
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuickReorder(order)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Quick Reorder
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(order.id)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

// Memoize to prevent re-renders when other orders change
export const OrderRow = memo(OrderRowComponent, (prevProps, nextProps) => {
  return (
    prevProps.order.id === nextProps.order.id &&
    prevProps.order.status === nextProps.order.status &&
    prevProps.order.total === nextProps.order.total &&
    prevProps.isSelected === nextProps.isSelected
  );
});
