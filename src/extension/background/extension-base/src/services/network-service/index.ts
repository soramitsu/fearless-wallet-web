import { type EventService } from '@extension-base/services';

export class NetworkService {
  private eventService: EventService;

  constructor(eventService: EventService) {
    this.eventService = eventService;
  }
}
