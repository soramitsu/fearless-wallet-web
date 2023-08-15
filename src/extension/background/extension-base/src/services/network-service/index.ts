import { EventService } from '../event-service';

export class NetworkService {
  private eventService: EventService;

  constructor(eventService: EventService) {
    this.eventService = eventService;
  }
}
