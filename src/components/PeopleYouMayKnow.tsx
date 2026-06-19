import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, UserPlus, X, ChevronRight, Loader2 } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { usePeopleYouMayKnow } from "@/hooks/usePeopleYouMayKnow";

export const PeopleYouMayKnow = () => {
  const { suggestions, loading, removeSuggestion, sendFriendRequest } = usePeopleYouMayKnow(10);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleAddFriend = async (personId: string) => {
    await sendFriendRequest(personId);
    removeSuggestion(personId);
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  return (
    <Card className="p-3 bg-card border-border shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">People you may know</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-xs text-muted-foreground">No suggestions right now</p>
        </div>
      ) : (
        <>
          {/* Horizontal scrollable cards */}
          <div className="relative">
            <div
              ref={scrollRef}
              className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {suggestions.map((person) => (
                <div
                  key={person.id}
                  className="relative flex-shrink-0 w-[105px] bg-muted/30 rounded-lg overflow-hidden border border-border/50"
                >
                  {/* Close button */}
                  <button
                    onClick={() => removeSuggestion(person.id)}
                    className="absolute top-1 right-1 z-10 p-1 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                    aria-label="Remove suggestion"
                  >
                    <X className="h-2.5 w-2.5 text-white" />
                  </button>

                  {/* Profile Image */}
                  <Link to={`/profile/${person.username || person.id}`} className="block cursor-pointer">
                    {person.profile_pic ? (
                      <div className="w-full aspect-square bg-muted">
                        <img
                          src={person.profile_pic}
                          alt={person.display_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/40">
                        <span className="text-2xl font-bold text-primary/60">
                          {person.display_name?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                  </Link>

                  {/* Info section */}
                  <div className="p-2 text-center">
                    <Link
                      to={`/profile/${person.username || person.id}`}
                      className="text-xs font-medium text-foreground truncate block leading-tight hover:underline"
                    >
                      {person.display_name}
                    </Link>
                    {person.mutual_friends_count > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                        {person.mutual_friends_count} mutual
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-1.5 h-7 text-[11px] gap-1 px-1 text-primary border-primary hover:bg-primary/10"
                      onClick={() => handleAddFriend(person.id)}
                    >
                      <UserPlus className="h-3 w-3" />
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Scroll right button */}
            {suggestions.length > 3 && (
              <button
                onClick={scrollRight}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-background/90 border border-border shadow-md hover:bg-muted transition-colors"
                aria-label="See more"
              >
                <ChevronRight className="h-4 w-4 text-foreground" />
              </button>
            )}
          </div>

          {/* See all link */}
          <button className="w-full text-center text-primary text-xs font-medium mt-2 hover:underline">
            See all
          </button>
        </>
      )}
    </Card>
  );
};
