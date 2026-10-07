import { Injectable } from "@angular/core";
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { CrudService } from "src/app/core/services/crud.service";
import { SimulationsalaireService } from "src/app/core/services/simulationsalaire/simulationsalaire.service";
import { 
  addsimulationsalaireData,
  addsimulationsalaireDataFailure,
  addsimulationsalaireDataSuccess,

  deletesimulationsalaireData,
  deletesimulationsalaireFailure,
  deletesimulationsalaireSuccess,
  
  deletemultiplesimulationsalaireData,
  deletemultiplesimulationsalaireSuccess,
  deletemultiplesimulationsalaireFailure,
  
  fetchsimulationsalaireData,
  fetchsimulationsalaireFailure,
  fetchsimulationsalaireSuccess,

  updatesimulationsalaireData,
  updatesimulationsalaireDataFailure,
  updatesimulationsalaireDataSuccess,

  fetchsimulationsalaireNoPaginateData,
  fetchsimulationsalaireNoPaginateSuccess,
  fetchsimulationsalaireNoPaginateFailure
} from "./simulationsalaire.action";

@Injectable()
export class SimulationsalaireEffects {
    
    fetchlistData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(fetchsimulationsalaireData),
            mergeMap(({ page }) =>
                this.SimulationsalaireService.getAllSimulationsalaires(page || 1).pipe(
                    map((response) => {
                        console.log("Données chargées:", response);
                        return fetchsimulationsalaireSuccess({ response });
                    }),
                    catchError((error) => {
                        console.error("Erreur lors du chargement des données:", error);
                        return of(fetchsimulationsalaireFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    //Liste sans pagination
    fetchlistNoPaginData$ = createEffect(() =>
            this.actions$.pipe(
              ofType(fetchsimulationsalaireNoPaginateData),
              mergeMap(() =>
                this.SimulationsalaireService.getListSimulationsalaires().pipe(
                  map((response) => fetchsimulationsalaireNoPaginateSuccess({ response })),
                  catchError((error) => of(fetchsimulationsalaireNoPaginateFailure({ error: error.toString() })))
                )
              )
            )
          );

    // Ajouter une simulation salaire
    addData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(addsimulationsalaireData),
            mergeMap(({ newData }) =>
                this.SimulationsalaireService.createSimulationsalaire(newData).pipe(
                    map((response) => addsimulationsalaireDataSuccess({ newData: response })),
                    catchError((error) => {
                        console.error("Erreur lors de l'ajout:", error);
                        return of(addsimulationsalaireDataFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après ajout
    addSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(addsimulationsalaireDataSuccess),
            map(() => fetchsimulationsalaireData({ page: 1 }))  // Retour à la première page après ajout
        )
    );

    // Mettre à jour une simulation salaire
    updateData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(updatesimulationsalaireData),
            mergeMap(({ updatedData }) =>
                this.SimulationsalaireService.updateSimulationsalaire(updatedData).pipe(
                    map(() => updatesimulationsalaireDataSuccess({ updatedData })),
                    catchError((error) => {
                        console.error("Erreur lors de la mise à jour:", error);
                        return of(updatesimulationsalaireDataFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après mise à jour
    updateSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(updatesimulationsalaireDataSuccess),
            mergeMap(() => this.SimulationsalaireService.getCurrentPageInfo().pipe(
                map(({ currentPage }) => {
                    console.log("Mise à jour réussie, rechargement de la page", currentPage);
                    // Utiliser explicitement le numéro de page actuel
                    return fetchsimulationsalaireData({ page: currentPage });
                })
            ))
        )
    );

    // Supprimer une simulation salaire
    deleteData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deletesimulationsalaireData),
            mergeMap(({ id }) =>
                this.SimulationsalaireService.deleteSimulationsalaire(id).pipe(
                    map(() => deletesimulationsalaireSuccess({ id })),
                    catchError((error) => {
                        console.error("Erreur lors de la suppression:", error);
                        return of(deletesimulationsalaireFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après suppression d'une simulation salaire
    deleteSingleSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deletesimulationsalaireSuccess),
            mergeMap(() => this.SimulationsalaireService.getCurrentPageInfo().pipe(
                map(({ currentPage, totalItems, itemsPerPage }) => {
                    console.log("Suppression réussie, vérification de la pagination");
                    
                    // Calculer le nombre total de pages après suppression
                    const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
                    
                    // Si currentPage > totalPages, revenir à la dernière page disponible
                    if (currentPage > totalPages) {
                        console.log(`Redirection vers la page ${totalPages} (dernière page disponible)`);
                        return fetchsimulationsalaireData({ page: totalPages > 0 ? totalPages : 1 });
                    } else {
                        // Sinon, rester sur la page actuelle
                        console.log(`Maintien sur la page ${currentPage}`);
                        return fetchsimulationsalaireData({ page: currentPage });
                    }
                }),
                catchError(error => {
                    console.error("Erreur lors de la vérification de pagination:", error);
                    // En cas d'erreur, charger la première page
                    return of(fetchsimulationsalaireData({ page: 1 }));
                })
            ))
        )
    );

    // Supprimer plusieurs simulation salaire
    deleteMultipleData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deletemultiplesimulationsalaireData),
            mergeMap(({ id }) => {
                // S'assurer que l'ID est bien formaté
                if (!id || id.trim() === '') {
                    console.error("Aucun ID valide pour la suppression multiple");
                    return of(deletemultiplesimulationsalaireFailure({ error: "Aucun ID valide" }));
                }
                
                const idArray = id.split(',')
                    .filter(idStr => idStr.trim() !== '')
                    .map(idStr => parseInt(idStr.trim()))
                    .filter(id => !isNaN(id));
                
                console.log("Suppression multiple des IDs:", idArray);
                
                if (idArray.length === 0) {
                    console.error("Aucun ID valide après conversion");
                    return of(deletemultiplesimulationsalaireFailure({ error: "Aucun ID valide après conversion" }));
                }
                
                return this.SimulationsalaireService.deleteMultipleSimulationsalaire(idArray).pipe(
                    map(() => deletemultiplesimulationsalaireSuccess({ id })),
                    catchError((error) => {
                        console.error("Erreur lors de la suppression multiple:", error);
                        return of(deletemultiplesimulationsalaireFailure({ error: error.toString() }));
                    })
                );
            })
        )
    );

    // Récharger après suppression multiple
    deletemultipleSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deletemultiplesimulationsalaireSuccess),
            mergeMap(({ id }) => {
                const deletedCount = id.split(',').filter(i => i.trim() !== '').length;
                
                return this.SimulationsalaireService.getCurrentPageInfo().pipe(
                    map(({ currentPage, totalItems, itemsPerPage }) => {
                        console.log("Suppression multiple réussie, vérification de la pagination");
                        console.log(`Items supprimés: ${deletedCount}, totalItems: ${totalItems}, page actuelle: ${currentPage}`);
                        
                        // Calculer le nombre total de pages après suppression multiple
                        const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
                        
                        // Si currentPage > totalPages, revenir à la dernière page disponible
                        if (currentPage > totalPages) {
                            console.log(`Redirection vers la page ${totalPages} (dernière page disponible)`);
                            return fetchsimulationsalaireData({ page: totalPages > 0 ? totalPages : 1 });
                        } else {
                            // Sinon, rester sur la page actuelle
                            console.log(`Maintien sur la page ${currentPage}`);
                            return fetchsimulationsalaireData({ page: currentPage });
                        }
                    }),
                    catchError(error => {
                        console.error("Erreur lors de la vérification de pagination:", error);
                        // En cas d'erreur, charger la première page
                        return of(fetchsimulationsalaireData({ page: 1 }));
                    })
                );
            })
        )
    );

    constructor(
        private actions$: Actions,
        private CrudService: CrudService,
        private SimulationsalaireService: SimulationsalaireService
    ) { }
}