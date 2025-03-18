
import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

interface RecentActivityProps {
  isLoading: boolean;
  activityData?: any[];
}

const RecentActivity: React.FC<RecentActivityProps> = ({ isLoading, activityData: initialActivityData }) => {
  const [activityData, setActivityData] = useState(initialActivityData || []);

  useEffect(() => {
    // Set initial data from props
    if (initialActivityData) {
      setActivityData(initialActivityData);
    }

    // Setup real-time data fetch with 1-second interval
    const fetchRecentActivity = async () => {
      try {
        const { data, error } = await supabase
          .from('attendance_records')
          .select('*, user_id')
          .order('timestamp', { ascending: false })
          .limit(10); // Increased limit to show more records
          
        if (error) {
          console.error('Error fetching recent activity:', error);
          return;
        }
        
        if (data) {
          // Process the data to extract user info from device_info
          const processedData = await Promise.all(data.map(async (record) => {
            let name = 'Unknown';
            
            // Try to get name from device_info
            if (record.device_info && typeof record.device_info === 'object' && !Array.isArray(record.device_info)) {
              const deviceInfo = record.device_info as { [key: string]: Json };
              if (deviceInfo.metadata && 
                  typeof deviceInfo.metadata === 'object' && 
                  !Array.isArray(deviceInfo.metadata) &&
                  'name' in deviceInfo.metadata) {
                name = deviceInfo.metadata.name as string;
              }
            }
            
            // If no name in device_info, try to get from profiles table
            if (name === 'Unknown' && record.user_id) {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', record.user_id)
                .maybeSingle();
                
              if (profileData && profileData.username) {
                name = profileData.username;
              }
            }
            
            return {
              ...record,
              displayName: name
            };
          }));
          
          setActivityData(processedData);
        }
      } catch (err) {
        console.error('Failed to fetch recent activity:', err);
      }
    };

    // Fetch immediately and then set up interval
    fetchRecentActivity();
    const intervalId = setInterval(fetchRecentActivity, 1000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, [initialActivityData]);

  return (
    <Card className="p-6 md:col-span-2 animate-slide-in-up" style={{ animationDelay: '300ms' }}>
      <h3 className="text-lg font-medium mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : (
          activityData?.map((item: any, index: number) => {
            // Extract name from processed data
            const name = item.displayName || 'Unknown';
            const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const status = item.status === 'present' ? 'Checked in' : 
                          item.status === 'late' ? 'Checked in (Late)' : 'Unauthorized';
            
            return (
              <div key={`${item.id}-${index}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-medium">{name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">{time}</p>
                  </div>
                </div>
                <span className={`text-sm px-2 py-1 rounded-full ${
                  status.includes('Late') 
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500' 
                    : status.includes('Unauthorized')
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500'
                }`}>
                  {status}
                </span>
              </div>
            );
          }) || []
        )}
        
        {!isLoading && activityData?.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            No recent activity
          </div>
        )}
      </div>
    </Card>
  );
};

export default RecentActivity;
