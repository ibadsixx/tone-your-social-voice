import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LifeEventForm } from '@/components/LifeEventForm';
import { useLifeEvents, type LifeEvent } from '@/hooks/useLifeEvents';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Edit, Trash2, Calendar, Globe, Users, Lock } from 'lucide-react';
import { VisibilitySelector, type Visibility } from '@/components/VisibilitySelector';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';

interface LifeEventsSectionProps {
  profileId: string;
  isOwnProfile: boolean;
}

const getVisibilityIcon = (visibility: Visibility) => {
  switch (visibility) {
    case 'public':
      return Globe;
    case 'friends':
      return Users;
    case 'only_me':
      return Lock;
    default:
      return Users;
  }
};

const getVisibilityLabel = (visibility: Visibility) => {
  switch (visibility) {
    case 'public':
      return 'Public';
    case 'friends':
      return 'Friends';
    case 'only_me':
      return 'Only Me';
    default:
      return 'Friends';
  }
};

export const LifeEventsSection: React.FC<LifeEventsSectionProps> = ({
  profileId,
  isOwnProfile
}) => {
  const { user } = useAuth();
  const {
    lifeEvents,
    loading,
    createLifeEvent,
    updateLifeEvent,
    deleteLifeEvent,
    getEventsByCategory
  } = useLifeEvents(profileId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null);

  const handleAddEvent = () => {
    setEditingEvent(null);
    setFormOpen(true);
  };

  const handleEditEvent = (event: LifeEvent) => {
    setEditingEvent(event);
    setFormOpen(true);
  };

  const handleSaveEvent = async (eventData: any) => {
    if (editingEvent) {
      return await updateLifeEvent(editingEvent.id, eventData);
    } else {
      return await createLifeEvent(eventData);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    return await deleteLifeEvent(eventId);
  };

  const eventsByCategory = getEventsByCategory();
  const hasEvents = lifeEvents.length > 0;

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center justify-between text-base md:text-lg">
            Life Events
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          <div className="text-center text-muted-foreground py-8">
            Loading life events...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center justify-between text-base md:text-lg">
            Life Events
            {isOwnProfile && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddEvent}
                className="flex items-center gap-1 md:gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden md:inline">Add a life event</span>
                <span className="md:hidden">Add</span>
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          {!hasEvents ? (
            <div className="text-center py-6 md:py-8">
              <div className="text-xs md:text-sm text-muted-foreground mb-3 md:mb-4">
                {isOwnProfile 
                  ? "You haven't added any life events yet. Share your important moments and milestones!"
                  : "No life events to display."
                }
              </div>
              {isOwnProfile && (
                <Button onClick={handleAddEvent} className="flex items-center gap-2 mx-auto" size="sm">
                  <Plus className="w-4 h-4" />
                  Add your first life event
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4 md:space-y-6">
              {Object.entries(eventsByCategory).map(([category, events]) => (
                <div key={category} className="space-y-2 md:space-y-3">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {category}
                    </Badge>
                    <span className="text-xs md:text-sm text-muted-foreground">
                      ({events.length} {events.length === 1 ? 'event' : 'events'})
                    </span>
                  </h3>
                  <div className="space-y-2 md:space-y-3">
                    {events.map((event) => {
                      const VisibilityIcon = getVisibilityIcon(event.visibility);
                      return (
                        <div
                          key={event.id}
                          className="p-3 md:p-4 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-1 md:space-y-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-sm md:text-base text-foreground">
                                  {event.title}
                                </h4>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <VisibilityIcon className="w-3 h-3" />
                                  <span>{getVisibilityLabel(event.visibility)}</span>
                                </div>
                              </div>
                              
                              {event.extra_info && (
                                <p className="text-xs md:text-sm text-muted-foreground">
                                  {event.extra_info}
                                </p>
                              )}
                              
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="w-3 h-3 shrink-0" />
                                <span>
                                  Added {format(new Date(event.created_at), 'MMM d, yyyy')}
                                </span>
                              </div>
                            </div>
                            
                            {isOwnProfile && (
                              <div className="flex items-center gap-1 ml-2 md:ml-4 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditEvent(event)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Life Event</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete "{event.title}"? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteEvent(event.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <LifeEventForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingEvent(null);
        }}
        onSave={handleSaveEvent}
        editingEvent={editingEvent}
      />
    </>
  );
};