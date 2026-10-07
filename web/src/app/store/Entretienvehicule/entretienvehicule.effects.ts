import { Injectable } from "@angular/core";
import { of } from 'rxjs';
import { catchError, map, mergeMap, tap } from 'rxjs/operators';
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { CrudService } from "src/app/core/services/crud.service";
import { EntretienvehiculeService } from "src/app/core/services/entretienvehicule/entretienvehicule.service";
import { 
  addentretienvehiculeData,
  addentretienvehiculeDataFailure,
  addentretienvehiculeDataSuccess,

  deleteentretienvehiculeData,
  deleteentretienvehiculeFailure,
  deleteentretienvehiculeSuccess,
  
  deletemultipleentretienvehiculeData,
  deletemultipleentretienvehiculeSuccess,
  deletemultipleentretienvehiculeFailure,
  
  fetchentretienvehiculeData,
  fetchentretienvehiculeFailure,
  fetchentretienvehiculeSuccess,

  updateentretienvehiculeData,
  updateentretienvehiculeDataFailure,
  updateentretienvehiculeDataSuccess,

  fetchentretienvehiculeNoPaginateData,
  fetchentretienvehiculeNoPaginateSuccess,
  fetchentretienvehiculeNoPaginateFailure
} from "./entretienvehicule.action";

@Injectable()
export class EntretienvehiculeEffects {
    
    fetchlistData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(fetchentretienvehiculeData),
            mergeMap(({ page }) =>
                this.EntretienvehiculeService.getAllEntretienvehicules(page || 1).pipe(
                    map((response) => {
                        console.log("Données chargées:", response);
                        return fetchentretienvehiculeSuccess({ response });
                    }),
                    catchError((error) => {
                        console.error("Erreur lors du chargement des données:", error);
                        return of(fetchentretienvehiculeFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    //Liste sans pagination
    fetchlistNoPaginData$ = createEffect(() =>
            this.actions$.pipe(
              ofType(fetchentretienvehiculeNoPaginateData),
              mergeMap(() =>
                this.EntretienvehiculeService.getListEntretienvehicules().pipe(
                  map((response) => fetchentretienvehiculeNoPaginateSuccess({ response })),
                  catchError((error) => of(fetchentretienvehiculeNoPaginateFailure({ error: error.toString() })))
                )
              )
            )
          );

    // Ajouter un entretien vehicule
    addData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(addentretienvehiculeData),
            mergeMap(({ newData }) =>
                this.EntretienvehiculeService.createEntretienvehicule(newData).pipe(
                    map((response) => addentretienvehiculeDataSuccess({ newData: response })),
                    catchError((error) => {
                        console.error("Erreur lors de l'ajout:", error);
                        return of(addentretienvehiculeDataFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après ajout
    addSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(addentretienvehiculeDataSuccess),
            map(() => fetchentretienvehiculeData({ page: 1 }))  // Retour à la première page après ajout
        )
    );

    // Mettre à jour un entretien vehicule
    updateData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(updateentretienvehiculeData),
            mergeMap(({ updatedData }) =>
                this.EntretienvehiculeService.updateEntretienvehicule(updatedData).pipe(
                    map(() => updateentretienvehiculeDataSuccess({ updatedData })),
                    catchError((error) => {
                        console.error("Erreur lors de la mise à jour:", error);
                        return of(updateentretienvehiculeDataFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après mise à jour
    updateSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(updateentretienvehiculeDataSuccess),
            mergeMap(() => this.EntretienvehiculeService.getCurrentPageInfo().pipe(
                map(({ currentPage }) => {
                    console.log("Mise à jour réussie, rechargement de la page", currentPage);
                    // Utiliser explicitement le numéro de page actuel
                    return fetchentretienvehiculeData({ page: currentPage });
                })
            ))
        )
    );

    // Supprimer un entretien vehicule
    deleteData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deleteentretienvehiculeData),
            mergeMap(({ id }) =>
                this.EntretienvehiculeService.deleteEntretienvehicule(id).pipe(
                    map(() => deleteentretienvehiculeSuccess({ id })),
                    catchError((error) => {
                        console.error("Erreur lors de la suppression:", error);
                        return of(deleteentretienvehiculeFailure({ error: error.toString() }));
                    })
                )
            )
        )
    );

    // Récharger après suppression d'un entretien vehicule
    deleteSingleSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deleteentretienvehiculeSuccess),
            mergeMap(() => this.EntretienvehiculeService.getCurrentPageInfo().pipe(
                map(({ currentPage, totalItems, itemsPerPage }) => {
                    console.log("Suppression réussie, vérification de la pagination");
                    
                    // Calculer le nombre total de pages après suppression
                    const totalPages = Math.ceil((totalItems - 1) / itemsPerPage);
                    
                    // Si currentPage > totalPages, revenir à la dernière page disponible
                    if (currentPage > totalPages) {
                        console.log(`Redirection vers la page ${totalPages} (dernière page disponible)`);
                        return fetchentretienvehiculeData({ page: totalPages > 0 ? totalPages : 1 });
                    } else {
                        // Sinon, rester sur la page actuelle
                        console.log(`Maintien sur la page ${currentPage}`);
                        return fetchentretienvehiculeData({ page: currentPage });
                    }
                }),
                catchError(error => {
                    console.error("Erreur lors de la vérification de pagination:", error);
                    // En cas d'erreur, charger la première page
                    return of(fetchentretienvehiculeData({ page: 1 }));
                })
            ))
        )
    );

    // Supprimer plusieurs entretien vehicule
    deleteMultipleData$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deletemultipleentretienvehiculeData),
            mergeMap(({ id }) => {
                // S'assurer que l'ID est bien formaté
                if (!id || id.trim() === '') {
                    console.error("Aucun ID valide pour la suppression multiple");
                    return of(deletemultipleentretienvehiculeFailure({ error: "Aucun ID valide" }));
                }
                
                const idArray = id.split(',')
                    .filter(idStr => idStr.trim() !== '')
                    .map(idStr => parseInt(idStr.trim()))
                    .filter(id => !isNaN(id));
                
                console.log("Suppression multiple des IDs:", idArray);
                
                if (idArray.length === 0) {
                    console.error("Aucun ID valide après conversion");
                    return of(deletemultipleentretienvehiculeFailure({ error: "Aucun ID valide après conversion" }));
                }
                
                return this.EntretienvehiculeService.deleteMultipleEntretienvehicule(idArray).pipe(
                    map(() => deletemultipleentretienvehiculeSuccess({ id })),
                    catchError((error) => {
                        console.error("Erreur lors de la suppression multiple:", error);
                        return of(deletemultipleentretienvehiculeFailure({ error: error.toString() }));
                    })
                );
            })
        )
    );

    // Récharger après suppression multiple
    deletemultipleSuccess$ = createEffect(() =>
        this.actions$.pipe(
            ofType(deletemultipleentretienvehiculeSuccess),
            mergeMap(({ id }) => {
                const deletedCount = id.split(',').filter(i => i.trim() !== '').length;
                
                return this.EntretienvehiculeService.getCurrentPageInfo().pipe(
                    map(({ currentPage, totalItems, itemsPerPage }) => {
                        console.log("Suppression multiple réussie, vérification de la pagination");
                        console.log(`Items supprimés: ${deletedCount}, totalItems: ${totalItems}, page actuelle: ${currentPage}`);
                        
                        // Calculer le nombre total de pages après suppression multiple
                        const totalPages = Math.ceil((totalItems - deletedCount) / itemsPerPage);
                        
                        // Si currentPage > totalPages, revenir à la dernière page disponible
                        if (currentPage > totalPages) {
                            console.log(`Redirection vers la page ${totalPages} (dernière page disponible)`);
                            return fetchentretienvehiculeData({ page: totalPages > 0 ? totalPages : 1 });
                        } else {
                            // Sinon, rester sur la page actuelle
                            console.log(`Maintien sur la page ${currentPage}`);
                            return fetchentretienvehiculeData({ page: currentPage });
                        }
                    }),
                    catchError(error => {
                        console.error("Erreur lors de la vérification de pagination:", error);
                        // En cas d'erreur, charger la première page
                        return of(fetchentretienvehiculeData({ page: 1 }));
                    })
                );
            })
        )
    );

    constructor(
        private actions$: Actions,
        private CrudService: CrudService,
        private EntretienvehiculeService: EntretienvehiculeService
    ) { }
}