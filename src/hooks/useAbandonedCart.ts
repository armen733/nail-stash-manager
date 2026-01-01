import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { CartItem } from '@/components/products/types';
import { useDebounce } from './useDebounce';

interface Profile {
  email: string;
  full_name: string;
}

export function useAbandonedCart(cart: CartItem[]) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const cartIdRef = useRef<string | null>(null);
  
  // Fetch profile once
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', user.id)
        .single();
      if (data) setProfile(data);
    };
    fetchProfile();
  }, [user]);
  
  // Debounce cart updates to avoid too many DB writes
  const debouncedCart = useDebounce(cart, 2000);

  const saveCart = useCallback(async (cartItems: CartItem[]) => {
    if (!user || cartItems.length === 0) {
      // If cart is empty and we have a cart ID, delete it
      if (cartIdRef.current && cartItems.length === 0) {
        await supabase
          .from('abandoned_carts')
          .delete()
          .eq('id', cartIdRef.current);
        cartIdRef.current = null;
      }
      return;
    }

    const items = cartItems.map(item => ({
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price_usd * item.quantity,
      image_url: item.product.image_url,
    }));

    const total = cartItems.reduce(
      (sum, item) => sum + item.product.price_usd * item.quantity, 
      0
    );

    const cartData = {
      user_id: user.id,
      email: profile?.email || user.email,
      name: profile?.full_name || 'Customer',
      items,
      total,
      updated_at: new Date().toISOString(),
    };

    try {
      if (cartIdRef.current) {
        // Update existing cart
        const { error } = await supabase
          .from('abandoned_carts')
          .update(cartData)
          .eq('id', cartIdRef.current);
        
        if (error) {
          console.error('Error updating abandoned cart:', error);
        }
      } else {
        // Create new cart
        const { data, error } = await supabase
          .from('abandoned_carts')
          .insert(cartData)
          .select('id')
          .single();
        
        if (error) {
          console.error('Error creating abandoned cart:', error);
        } else if (data) {
          cartIdRef.current = data.id;
        }
      }
    } catch (err) {
      console.error('Error saving abandoned cart:', err);
    }
  }, [user, profile]);

  // Mark cart as converted when order is placed
  const markAsConverted = useCallback(async () => {
    if (!cartIdRef.current) return;

    try {
      await supabase
        .from('abandoned_carts')
        .update({ converted_at: new Date().toISOString() })
        .eq('id', cartIdRef.current);
      
      cartIdRef.current = null;
    } catch (err) {
      console.error('Error marking cart as converted:', err);
    }
  }, []);

  // Save cart when it changes
  useEffect(() => {
    saveCart(debouncedCart);
  }, [debouncedCart, saveCart]);

  // Load existing cart on mount
  useEffect(() => {
    const loadExistingCart = async () => {
      if (!user) return;

      const { data } = await supabase
        .from('abandoned_carts')
        .select('id')
        .eq('user_id', user.id)
        .is('converted_at', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        cartIdRef.current = data.id;
      }
    };

    loadExistingCart();
  }, [user]);

  return { markAsConverted };
}
